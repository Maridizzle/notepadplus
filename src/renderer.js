import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, highlightWhitespace, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType, gutter, GutterMarker } from '@codemirror/view';
import { EditorState, Compartment, RangeSetBuilder, StateEffect, StateField, RangeSet } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, copyLineDown, moveLineUp, moveLineDown, toggleComment, toggleBlockComment } from '@codemirror/commands';
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
const whitespaceCompartment = new Compartment();
const splitWhitespaceCompartment = new Compartment();
const eolCompartment = new Compartment();
const splitEolCompartment = new Compartment();
let showWhitespace = false;
let showEol = false;

function eolLabel(eol) {
  return eol === '\r\n' ? 'CRLF' : eol === '\r' ? 'CR' : 'LF';
}

const ENCODING_LABELS = {
  utf8: 'UTF-8',
  utf8bom: 'UTF-8-BOM',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  ansi: 'ANSI',
};

function encodingLabel(enc) {
  return ENCODING_LABELS[enc] || 'UTF-8';
}

// Bookmarks
const bookmarkEffect = StateEffect.define({
  map: (v, mapping) => ({ pos: mapping.mapPos(v.pos), on: v.on }),
});
const clearBookmarksEffect = StateEffect.define();

const bookmarkMarker = new class extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-bookmark-dot';
    span.textContent = '●';
    return span;
  }
}();

function normalizeBookmarks(set, doc) {
  const starts = new Set();
  const iter = set.iter();
  while (iter.value) {
    starts.add(doc.lineAt(Math.min(iter.from, doc.length)).from);
    iter.next();
  }
  return RangeSet.of([...starts].sort((a, b) => a - b).map(p => bookmarkMarker.range(p)));
}

const bookmarkField = StateField.define({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    if (tr.docChanged) {
      const oldDoc = tr.startState.doc;
      const deleted = [];
      tr.changes.iterChangedRanges((fromA, toA) => {
        if (toA > fromA) deleted.push([fromA, toA]);
      });
      if (deleted.length) {
        set = set.update({
          filter: (from) => {
            const line = oldDoc.lineAt(Math.min(from, oldDoc.length));
            return !deleted.some(([a, b]) =>
              (line.to < oldDoc.length && a <= line.from && b >= line.to + 1)
              || (line.from > 0 && a <= line.from - 1 && b >= line.to));
          },
        });
      }
      set = set.map(tr.changes);
      set = normalizeBookmarks(set, tr.state.doc);
    }
    for (const e of tr.effects) {
      if (e.is(clearBookmarksEffect)) {
        set = RangeSet.empty;
      } else if (e.is(bookmarkEffect)) {
        const lineFrom = tr.state.doc.lineAt(e.value.pos).from;
        set = set.update({ filter: from => from !== lineFrom });
        if (e.value.on) set = set.update({ add: [bookmarkMarker.range(lineFrom)] });
      }
    }
    return set;
  },
});

const bookmarkGutter = gutter({
  class: 'cm-bookmark-gutter',
  markers: v => v.state.field(bookmarkField),
  initialSpacer: () => bookmarkMarker,
  domEventHandlers: {
    mousedown(view, line) {
      toggleBookmark(view, line.from);
      return true;
    },
  },
});

function bookmarkExtensions() {
  return [bookmarkField, bookmarkGutter];
}

function bookmarkLines(state) {
  const lines = new Set();
  const iter = state.field(bookmarkField).iter();
  while (iter.value) {
    lines.add(state.doc.lineAt(iter.from).number);
    iter.next();
  }
  return [...lines].sort((a, b) => a - b);
}

function toggleBookmark(view, pos = view.state.selection.main.head) {
  const line = view.state.doc.lineAt(pos);
  const on = !bookmarkLines(view.state).includes(line.number);
  view.dispatch({ effects: bookmarkEffect.of({ pos: line.from, on }) });
}

function gotoBookmark(view, direction) {
  const lines = bookmarkLines(view.state);
  if (!lines.length) return;
  const current = view.state.doc.lineAt(view.state.selection.main.head).number;
  let target;
  if (direction > 0) target = lines.find(n => n > current) ?? lines[0];
  else target = [...lines].reverse().find(n => n < current) ?? lines[lines.length - 1];
  const line = view.state.doc.line(target);
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  view.focus();
}

function bookmarkedLineText(view, marked) {
  const doc = view.state.doc;
  const set = new Set(bookmarkLines(view.state));
  const out = [];
  for (let i = 1; i <= doc.lines; i++) {
    if (set.has(i) === marked) out.push(doc.line(i).text);
  }
  return out;
}

function removeLines(view, predicate) {
  const doc = view.state.doc;
  const set = new Set(bookmarkLines(view.state));
  const changes = [];
  for (let i = 1; i <= doc.lines; i++) {
    if (!predicate(set.has(i))) continue;
    const line = doc.line(i);
    const from = line.from;
    const to = i < doc.lines ? doc.line(i + 1).from : line.to;
    const adjFrom = i === doc.lines && i > 1 ? doc.line(i - 1).to : from;
    changes.push({ from: i === doc.lines && i > 1 ? adjFrom : from, to });
  }
  if (!changes.length) return;
  view.dispatch({ changes, effects: clearBookmarksEffect.of(null) });
}

function bookmarkCommand(action) {
  const view = activeView();
  if (!view) return;
  const editable = editableView();
  switch (action) {
    case 'toggle': toggleBookmark(view); break;
    case 'next': gotoBookmark(view, 1); break;
    case 'prev': gotoBookmark(view, -1); break;
    case 'clear': view.dispatch({ effects: clearBookmarksEffect.of(null) }); break;
    case 'copy': copyToClipboard(bookmarkedLineText(view, true).join('\n')); break;
    case 'cut':
      if (!editable) return;
      copyToClipboard(bookmarkedLineText(view, true).join('\n'));
      removeLines(view, marked => marked);
      break;
    case 'remove':
      if (!editable) return;
      removeLines(view, marked => marked);
      break;
    case 'remove-unmarked':
      if (!editable) return;
      removeLines(view, marked => !marked);
      break;
    case 'inverse': {
      const set = new Set(bookmarkLines(view.state));
      const effects = [];
      for (let i = 1; i <= view.state.doc.lines; i++) {
        effects.push(bookmarkEffect.of({ pos: view.state.doc.line(i).from, on: !set.has(i) }));
      }
      view.dispatch({ effects });
      break;
    }
    default:
      break;
  }
}

class EolWidget extends WidgetType {
  constructor(label) {
    super();
    this.label = label;
  }
  eq(other) {
    return other.label === this.label;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-eol-marker';
    span.textContent = this.label;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

function eolMarkerPlugin(getLabel) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || hasRefreshEffect(update)) {
        this.decorations = this.build(update.view);
      }
    }
    build(view) {
      const builder = new RangeSetBuilder();
      const label = getLabel();
      const doc = view.state.doc;
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          if (line.number < doc.lines) {
            builder.add(line.to, line.to, Decoration.widget({ widget: new EolWidget(label), side: 1 }));
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  }, { decorations: v => v.decorations });
}

function mainEolLabel() {
  const tab = getActiveTab();
  return eolLabel(tab ? tab.eol : DEFAULT_EOL);
}

function splitEolLabel() {
  if (splitMode === 'file') return eolLabel(splitEol);
  if (splitMode === 'tab') {
    const tab = tabs.find(t => t.id === splitTabId);
    if (tab) return eolLabel(tab.eol);
  }
  return mainEolLabel();
}

function whitespaceExt() {
  return showWhitespace ? highlightWhitespace() : [];
}

function toggleShowWhitespace() {
  showWhitespace = !showWhitespace;
  editorView.dispatch({ effects: whitespaceCompartment.reconfigure(whitespaceExt()) });
  if (splitEditorView) {
    splitEditorView.dispatch({ effects: splitWhitespaceCompartment.reconfigure(whitespaceExt()) });
  }
}

function toggleShowEol() {
  showEol = !showEol;
  editorView.dispatch({
    effects: eolCompartment.reconfigure(showEol ? eolMarkerPlugin(mainEolLabel) : []),
  });
  if (splitEditorView) {
    splitEditorView.dispatch({
      effects: splitEolCompartment.reconfigure(showEol ? eolMarkerPlugin(splitEolLabel) : []),
    });
  }
}

function refreshEolMarkers() {
  if (!showEol) return;
  editorView.dispatch({ effects: refreshDecorations.of(null) });
  if (splitEditorView) splitEditorView.dispatch({ effects: refreshDecorations.of(null) });
}

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
    savedEol: null,
    encoding: opts.encoding || 'utf8',
    savedEncoding: null,
    scrollPos: opts.scrollPos || 0,
    cursorPos: opts.cursorPos || 0,
    state: null,
  };
  tab.savedEol = tab.eol;
  tab.savedEncoding = tab.encoding;
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
      whitespaceCompartment.reconfigure(whitespaceExt()),
      eolCompartment.reconfigure(showEol ? eolMarkerPlugin(mainEolLabel) : []),
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
    settings: collectSettings(),
    tabs: tabs.map(t => ({
      filePath: t.filePath,
      content: t.filePath ? null : t.content,
      cursorPos: t.cursorPos || 0,
      scrollPos: t.scrollPos || 0,
    })),
  };
}

async function restoreSession(session) {
  applySettings(session.settings);

  if (!session.tabs || session.tabs.length === 0) return;

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
          createTab(saved.filePath, result.content, { ...opts, encoding: result.encoding });
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
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });
    el.addEventListener('contextmenu', (e) => showTabContextMenu(e, tab));

    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      draggingTabId = tab.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-notepadplus-tab', String(tab.id));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      draggingTabId = null;
      el.classList.remove('dragging');
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', (e) => {
      if (draggingTabId === null || draggingTabId === tab.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drop-before', 'drop-after');
    });
    el.addEventListener('drop', (e) => {
      if (draggingTabId === null || draggingTabId === tab.id) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      const from = tabs.findIndex(t => t.id === draggingTabId);
      let to = tabs.findIndex(t => t.id === tab.id);
      if (from < 0 || to < 0) return;
      if (after) to += 1;
      if (from < to) to -= 1;
      moveTab(from, to);
      draggingTabId = null;
    });

    container.appendChild(el);
  }
}

let draggingTabId = null;

function moveTab(from, to) {
  if (to < 0 || to >= tabs.length || from === to) return;
  const [tab] = tabs.splice(from, 1);
  tabs.splice(to, 0, tab);
  renderTabs();
}

function tabCommand(action) {
  const idx = tabs.findIndex(t => t.id === activeTabId);
  if (idx < 0) return;
  const n = tabs.length;
  switch (action) {
    case 'next': switchToTab(tabs[(idx + 1) % n].id); break;
    case 'prev': switchToTab(tabs[(idx - 1 + n) % n].id); break;
    case 'first': switchToTab(tabs[0].id); break;
    case 'last': switchToTab(tabs[n - 1].id); break;
    case 'move-forward': moveTab(idx, idx + 1); break;
    case 'move-backward': moveTab(idx, idx - 1); break;
    default:
      if (action.startsWith('goto:')) {
        const k = parseInt(action.slice(5), 10);
        if (tabs[k - 1]) switchToTab(tabs[k - 1].id);
      }
  }
}

function hideTabContextMenu() {
  const existing = document.getElementById('tab-context-menu');
  if (existing) existing.remove();
}

function showPopupMenu(x, y, items) {
  hideTabContextMenu();

  const menu = document.createElement('div');
  menu.id = 'tab-context-menu';
  for (const item of items) {
    if (!item) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const [label, action, disabled, checked] = item;
    const el = document.createElement('div');
    el.className = 'ctx-item' + (disabled ? ' disabled' : '') + (checked ? ' checked' : '');
    el.textContent = label;
    if (!disabled) {
      el.addEventListener('click', () => {
        hideTabContextMenu();
        action();
      });
    }
    menu.appendChild(el);
  }

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - rect.height - 4) + 'px';

  const dismiss = (ev) => {
    if (ev.type === 'keydown' && ev.key !== 'Escape') return;
    if (ev.type === 'mousedown' && menu.contains(ev.target)) return;
    hideTabContextMenu();
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    window.removeEventListener('blur', dismiss);
  };
  document.addEventListener('mousedown', dismiss, true);
  document.addEventListener('keydown', dismiss, true);
  window.addEventListener('blur', dismiss);
}

function showStatusMenu(anchorEl, items) {
  const rect = anchorEl.getBoundingClientRect();
  showPopupMenu(rect.left, rect.top - 4, items);
  const menu = document.getElementById('tab-context-menu');
  if (menu) {
    const mrect = menu.getBoundingClientRect();
    menu.style.top = Math.max(0, rect.top - mrect.height - 4) + 'px';
  }
}

function showTabContextMenu(e, tab) {
  e.preventDefault();

  const dir = tab.filePath ? tab.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') : null;
  showPopupMenu(e.clientX, e.clientY, [
    ['Close', () => closeTab(tab.id)],
    ['Close All But This', () => closeTabsWhere(t => t.id !== tab.id)],
    ['Close All to the Left', () => closeTabsWhere((t, i) => i < tabs.findIndex(x => x.id === tab.id))],
    ['Close All to the Right', () => closeTabsWhere((t, i) => i > tabs.findIndex(x => x.id === tab.id))],
    ['Close All', closeAllTabs],
    null,
    ['Save', () => saveTab(tab)],
    ['Save As...', () => saveTabAs(tab)],
    ['Reload from Disk', () => reloadTab(tab), !tab.filePath],
    null,
    ['Copy Full Path', () => copyToClipboard(tab.filePath), !tab.filePath],
    ['Copy File Name', () => copyToClipboard(getFileName(tab.filePath)), !tab.filePath],
    ['Copy Directory Path', () => copyToClipboard(dir), !tab.filePath],
    ['Open Containing Folder', () => window.electronAPI.showItemInFolder({ filePath: tab.filePath }), !tab.filePath],
  ]);
}

function showEncodingMenu(anchorEl) {
  const current = statusTarget().encoding;
  showStatusMenu(anchorEl, Object.keys(ENCODING_LABELS).map(enc => [
    ENCODING_LABELS[enc], () => setEncoding(enc), false, enc === current,
  ]));
}

function showEolMenu(anchorEl) {
  const current = statusTarget().eol;
  showStatusMenu(anchorEl, [
    ['Windows (CR LF)', () => setEol('\r\n'), false, current === '\r\n'],
    ['Unix (LF)', () => setEol('\n'), false, current === '\n'],
    ['Macintosh (CR)', () => setEol('\r'), false, current === '\r'],
  ]);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

async function closeTabsWhere(predicate) {
  const targets = tabs.filter((t, i) => predicate(t, i)).map(t => t.id);
  for (const id of targets) {
    const before = tabs.length;
    await closeTab(id);
    if (tabs.length === before && tabs.some(t => t.id === id)) return;
  }
}

function closeAllTabs() {
  return closeTabsWhere(() => true);
}

async function saveAllTabs() {
  for (const tab of tabs.filter(t => t.modified)) {
    if (!(await saveTab(tab))) return false;
  }
  if (splitMode === 'file' && splitModified) return saveSplitFile();
  return true;
}

async function saveCopyAs() {
  const target = statusTarget();
  const content = target.view.state.doc.toString();
  const result = await window.electronAPI.saveAs({
    content: content.replace(/\n/g, target.eol),
    defaultPath: target.filePath || 'untitled.txt',
  });
  if (!result.success && !result.canceled) reportSaveError(result.filePath || 'file', result.error);
}

async function confirmAction(opts) {
  if (!window.electronAPI || !window.electronAPI.confirmAction) return 0;
  return window.electronAPI.confirmAction(opts);
}

async function reloadTab(tab, encoding) {
  if (!tab || !tab.filePath || !window.electronAPI) return;
  if (tab.modified) {
    const choice = await confirmAction({
      message: `Reload ${getFileName(tab.filePath)} from disk?`,
      detail: 'Unsaved changes in this document will be lost.',
      buttons: ['Reload', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice !== 0) return;
  }
  const result = await window.electronAPI.readFile({ filePath: tab.filePath, encoding });
  if (!result.success) {
    reportSaveError(tab.filePath, result.error);
    return;
  }
  if (tab.autoSaveTimer) clearTimeout(tab.autoSaveTimer);
  const content = normalizeNewlines(result.content);
  tab.eol = detectEol(result.content);
  tab.savedEol = tab.eol;
  tab.encoding = result.encoding || 'utf8';
  tab.savedEncoding = tab.encoding;
  tab.content = content;
  tab.savedContent = content;
  tab.modified = false;
  tab.cursorPos = 0;
  tab.scrollPos = 0;
  tab.state = createTabState(tab);
  if (tab.id === activeTabId) {
    editorView.setState(tab.state);
    applyEditorSettings();
    if (proseMode) document.getElementById('prose-editor').value = content;
    refreshSplitClone();
  }
  if (splitMode === 'tab' && splitTabId === tab.id && splitEditorView) {
    syncingSplit = true;
    try {
      splitEditorView.dispatch({
        changes: { from: 0, to: splitEditorView.state.doc.length, insert: content },
      });
    } finally {
      syncingSplit = false;
    }
  }
  renderTabs();
  updateStatusBar();
  refreshEolMarkers();
}

async function reloadSplitFile(encoding) {
  if (!splitEditorView || !splitFilePath) return;
  if (splitModified) {
    const choice = await confirmAction({
      message: `Reload ${getFileName(splitFilePath)} from disk?`,
      detail: 'Unsaved changes in this document will be lost.',
      buttons: ['Reload', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice !== 0) return;
  }
  const result = await window.electronAPI.readFile({ filePath: splitFilePath, encoding });
  if (!result.success) {
    reportSaveError(splitFilePath, result.error);
    return;
  }
  const content = normalizeNewlines(result.content);
  splitEol = detectEol(result.content);
  splitSavedEol = splitEol;
  splitEncoding = result.encoding || 'utf8';
  splitSavedEncoding = splitEncoding;
  splitSavedContent = content;
  syncingSplit = true;
  try {
    splitEditorView.dispatch({
      changes: { from: 0, to: splitEditorView.state.doc.length, insert: content },
    });
  } finally {
    syncingSplit = false;
  }
  splitModified = false;
  updateStatusBar();
  refreshEolMarkers();
}

function reloadCurrent(encoding) {
  const target = rightPaneTarget();
  if (target === 'file') return reloadSplitFile(encoding);
  if (target === 'tab') return reloadTab(tabs.find(t => t.id === splitTabId), encoding);
  return reloadTab(getActiveTab(), encoding);
}

function setEncoding(enc) {
  if (!ENCODING_LABELS[enc]) return;
  const target = rightPaneTarget();
  if (target === 'file') {
    splitEncoding = enc;
    splitModified = computeSplitModified();
    if (splitModified) scheduleSplitAutoSave();
    updateStatusBar();
    return;
  }
  const tab = target === 'tab' ? tabs.find(t => t.id === splitTabId) : getActiveTab();
  if (!tab) return;
  tab.encoding = enc;
  refreshTabModified(tab);
}

function currentFilePath() {
  return statusTarget().filePath || null;
}

function openContainingFolder() {
  const p = currentFilePath();
  if (p && window.electronAPI) window.electronAPI.showItemInFolder({ filePath: p });
}

function openInDefaultViewer() {
  const p = currentFilePath();
  if (p && window.electronAPI) window.electronAPI.openPath({ filePath: p });
}

async function showSummary() {
  if (!window.electronAPI || !window.electronAPI.showInfo) return;
  const target = statusTarget();
  const text = target.view.state.doc.toString();
  const lines = [];
  lines.push(`Full file path: ${target.filePath || '(unsaved)'}`);
  if (target.filePath) {
    const st = await window.electronAPI.fileStat({ filePath: target.filePath });
    if (st.success) {
      lines.push(`Created: ${new Date(st.birthtimeMs).toLocaleString()}`);
      lines.push(`Modified: ${new Date(st.mtimeMs).toLocaleString()}`);
      lines.push(`Size on disk: ${st.size.toLocaleString()} bytes`);
    }
  }
  const eolCount = Math.max(0, target.view.state.doc.lines - 1);
  const bytes = new TextEncoder().encode(text.replace(/\n/g, target.eol)).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  lines.push('');
  lines.push(`Lines: ${target.view.state.doc.lines.toLocaleString()}`);
  lines.push(`Characters (without line endings): ${(text.length - eolCount).toLocaleString()}`);
  lines.push(`Characters (with line endings): ${(text.length - eolCount + eolCount * target.eol.length).toLocaleString()}`);
  lines.push(`Words: ${words.toLocaleString()}`);
  lines.push(`Bytes (as saved): ${bytes.toLocaleString()}`);
  lines.push(`Line endings: ${eolLabel(target.eol)}`);
  lines.push(`Encoding: ${encodingLabel(target.encoding)}`);
  await window.electronAPI.showInfo({
    title: 'File Summary',
    message: getFileName(target.filePath),
    detail: lines.join('\n'),
  });
}

function focusOtherView() {
  if (!splitEditorView) return;
  if (focusedPane === 'right') {
    if (proseMode) document.getElementById('prose-editor').focus();
    else editorView.focus();
  } else {
    splitEditorView.focus();
  }
}

function setEol(eol) {
  const target = rightPaneTarget();
  if (target === 'file') {
    splitEol = eol;
    splitModified = computeSplitModified();
    if (splitModified) scheduleSplitAutoSave();
    updateStatusBar();
    refreshEolMarkers();
    return;
  }
  const tab = target === 'tab' ? tabs.find(t => t.id === splitTabId) : getActiveTab();
  if (!tab) return;
  tab.eol = eol;
  refreshTabModified(tab);
  refreshEolMarkers();
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
    return { filePath: splitFilePath, modified: splitModified, eol: splitEol, encoding: splitEncoding, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'tab') {
    const st = tabs.find(t => t.id === splitTabId) || tab;
    return { filePath: st.filePath, modified: st.modified, eol: st.eol, encoding: st.encoding, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'compare') {
    return { filePath: compareRightPath, modified: false, eol: tab.eol, encoding: 'utf8', view: splitEditorView };
  }
  return { filePath: tab.filePath, modified: tab.modified, eol: tab.eol, encoding: tab.encoding, view: editorView };
}

function updateStatusBar() {
  const tab = getActiveTab();
  if (!tab) return;
  const target = statusTarget();

  document.getElementById('status-file').textContent = target.filePath || 'Untitled';
  document.getElementById('status-modified').textContent = target.modified ? '(Modified)' : '';

  const lang = getLanguageForFile(target.filePath);
  document.getElementById('status-lang').textContent = lang.name;
  document.getElementById('status-encoding').textContent = encodingLabel(target.encoding);
  document.getElementById('status-eol').textContent = eolLabel(target.eol);

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

function refreshTabModified(tab) {
  tab.modified = tab.content !== tab.savedContent
    || tab.eol !== tab.savedEol
    || tab.encoding !== tab.savedEncoding;
  renderTabs();
  updateStatusBar();
  if (tab.modified && tab.filePath) {
    scheduleAutoSave(tab);
  }
}

function markModified() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = getCurrentContent();
  refreshTabModified(tab);
}

function tabContent(tab) {
  return tab.id === activeTabId ? getCurrentContent() : tab.content;
}

function markTabSaved(tab, content) {
  tab.content = content;
  tab.savedContent = content;
  tab.savedEol = tab.eol;
  tab.savedEncoding = tab.encoding;
  tab.modified = false;
  renderTabs();
  updateStatusBar();
}

function reportSaveError(filePath, error) {
  if (window.electronAPI && window.electronAPI.showError) {
    window.electronAPI.showError({
      title: 'Save failed',
      message: `Could not save ${filePath}\n\n${error || 'Unknown error'}`,
    });
  }
}

function applyTabLanguage(tab) {
  const effect = languageCompartment.reconfigure(getLanguageExtension(tab.filePath));
  if (tab.id === activeTabId) {
    editorView.dispatch({ effects: effect });
  } else {
    tab.state = tab.state.update({ effects: effect }).state;
  }
  if (splitMode === 'tab' && splitTabId === tab.id && splitEditorView) {
    splitEditorView.dispatch({
      effects: splitLanguageCompartment.reconfigure(getLanguageExtension(tab.filePath)),
    });
  }
}

async function saveTab(tab, opts = {}) {
  if (!tab || !window.electronAPI) return false;
  if (!tab.filePath) return saveTabAs(tab);

  const content = tabContent(tab);
  const result = await window.electronAPI.saveFile({
    filePath: tab.filePath,
    content: content.replace(/\n/g, tab.eol),
    encoding: tab.encoding,
  });
  if (!result.success) {
    if (!opts.silent) reportSaveError(tab.filePath, result.error);
    return false;
  }
  markTabSaved(tab, content);
  return true;
}

async function saveTabAs(tab) {
  if (!tab || !window.electronAPI) return false;

  const content = tabContent(tab);
  const result = await window.electronAPI.saveAs({
    content: content.replace(/\n/g, tab.eol),
    defaultPath: tab.filePath || 'untitled.txt',
    encoding: tab.encoding,
  });
  if (!result.success) {
    if (!result.canceled) reportSaveError(result.filePath || 'file', result.error);
    return false;
  }
  tab.filePath = result.filePath;
  applyTabLanguage(tab);
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
    ...bookmarkExtensions(),
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
    whitespaceCompartment.of(whitespaceExt()),
    eolCompartment.of(showEol ? eolMarkerPlugin(mainEolLabel) : []),
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
        createTab(fullPath, result.content, { encoding: result.encoding });
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
    if (await saveTab(tab, { silent: true })) {
      flashAutoSaveIndicator();
    } else {
      flashAutoSaveIndicator('Auto-save failed', '#e05a5a');
    }
  }, AUTO_SAVE_DELAY);
}

function flashAutoSaveIndicator(text = 'Saved!', color = '#4ec969') {
  const indicator = document.getElementById('autosave-indicator');
  indicator.textContent = text;
  indicator.style.color = color;
  setTimeout(() => {
    indicator.textContent = 'Auto-save: ON';
    indicator.style.color = '';
  }, 2500);
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

function toggleWordWrap() {
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
}

function collectSettings() {
  const sidebar = document.getElementById('sidebar');
  return {
    fontSize,
    fontFamily: currentFontFamily,
    wordWrap,
    isDarkTheme,
    leftBgColor,
    rightBgColor,
    proseBgColor,
    sidebarVisible,
    sidebarWidth: sidebar.style.width || null,
    minimapVisible,
    showWhitespace,
    showEol,
  };
}

function applySettings(s) {
  if (!s) return;
  if (typeof s.fontSize === 'number') setFontSize(s.fontSize);
  if (s.fontFamily) {
    document.getElementById('font-select').value = s.fontFamily;
    setEditorFont(s.fontFamily);
  }
  if (typeof s.wordWrap === 'boolean' && s.wordWrap !== wordWrap) toggleWordWrap();
  if (s.isDarkTheme === false && isDarkTheme) toggleTheme();
  if (s.leftBgColor || s.rightBgColor || s.proseBgColor) {
    leftBgColor = s.leftBgColor || null;
    rightBgColor = s.rightBgColor || null;
    proseBgColor = s.proseBgColor || null;
    applyPaneThemes();
    document.getElementById('prose-editor').style.background = proseBgColor || '';
    if (leftBgColor) document.getElementById('bg-color').value = leftBgColor;
  }
  if (s.sidebarVisible === false && sidebarVisible) toggleSidebar();
  if (s.sidebarWidth) document.getElementById('sidebar').style.width = s.sidebarWidth;
  if (s.minimapVisible && !minimapVisible) toggleMinimap();
  if (s.showWhitespace && !showWhitespace) toggleShowWhitespace();
  if (s.showEol && !showEol) toggleShowEol();
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
  const savedEol = splitSavedEol;
  const encoding = splitEncoding;
  const savedEncoding = splitSavedEncoding;
  const tab = createTab(filePath, content, { encoding });
  tab.eol = eol;
  tab.savedEol = savedEol;
  tab.savedEncoding = savedEncoding;
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
      createTab(filePath, result.content, { encoding: result.encoding });
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
  rootDiv.innerHTML = `<span class="tree-icon folder">&#9660;</span><span class="tree-label">${escapeHtml(rootLabel)}</span>`;
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
      itemDiv.innerHTML = `<span class="tree-icon folder">&#9654;</span><span class="tree-label">${escapeHtml(item.name)}</span>`;

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
      itemDiv.innerHTML = `<span class="tree-icon file">&#9679;</span><span class="tree-label">${escapeHtml(item.name)}</span>`;
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

    item.innerHTML = `<span class="recent-name">${escapeHtml(name)}</span><span class="recent-path">${escapeHtml(dir)}</span>`;
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

  window.addEventListener('resize', () => {
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
    case 'propercase':
      result = selected.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      break;
    case 'sentencecase':
      result = selected.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, m => m.toUpperCase());
      break;
    case 'invertcase':
      result = Array.from(selected, c => {
        const lower = c.toLowerCase();
        return c === lower ? c.toUpperCase() : lower;
      }).join('');
      break;
    case 'randomcase':
      result = Array.from(selected, c => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join('');
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
function leadingNumber(line) {
  const m = /^\s*[-+]?\d+(\.\d+)?/.exec(line);
  return m ? parseFloat(m[0]) : null;
}

function compareNumeric(a, b) {
  const na = leadingNumber(a);
  const nb = leadingNumber(b);
  if (na === null && nb === null) return a.localeCompare(b);
  if (na === null) return 1;
  if (nb === null) return -1;
  return na - nb;
}

function lineOperation(type) {
  const view = editableView();
  if (!view) return;

  if (type === 'duplicate') { copyLineDown(view); return; }
  if (type === 'move-up') { moveLineUp(view); return; }
  if (type === 'move-down') { moveLineDown(view); return; }

  const state = view.state;
  const doc = state.doc;
  const { from, to } = state.selection.main;

  let startLine, endLine;
  if (from === to) {
    startLine = 1;
    endLine = doc.lines;
  } else {
    startLine = doc.lineAt(from).number;
    const endPos = doc.lineAt(to).from === to ? to - 1 : to;
    endLine = doc.lineAt(endPos).number;
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
    case 'sort-asc-ci':
      result = [...lines].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      break;
    case 'sort-desc-ci':
      result = [...lines].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }));
      break;
    case 'sort-num-asc':
      result = [...lines].sort(compareNumeric);
      break;
    case 'sort-num-desc':
      result = [...lines].sort((a, b) => compareNumeric(b, a));
      break;
    case 'remove-consecutive-dupes':
      result = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
      break;
    case 'join':
      result = [lines.map(l => l.trim()).filter(Boolean).join(' ')];
      break;
    case 'randomize':
      result = [...lines];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
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
let splitSavedEol = DEFAULT_EOL;
let splitEncoding = 'utf8';
let splitSavedEncoding = 'utf8';
let splitSavedContent = '';

function computeSplitModified() {
  if (!splitEditorView) return false;
  return splitEditorView.state.doc.toString() !== splitSavedContent
    || splitEol !== splitSavedEol
    || splitEncoding !== splitSavedEncoding;
}
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
    if (await saveSplitFile({ silent: true })) {
      flashAutoSaveIndicator();
    } else {
      flashAutoSaveIndicator('Auto-save failed', '#e05a5a');
    }
  }, AUTO_SAVE_DELAY);
}

async function saveSplitFile(opts = {}) {
  if (!splitEditorView || !splitFilePath || !window.electronAPI) return false;
  const content = splitEditorView.state.doc.toString();
  const result = await window.electronAPI.saveFile({
    filePath: splitFilePath,
    content: content.replace(/\n/g, splitEol),
    encoding: splitEncoding,
  });
  if (!result.success) {
    if (!opts.silent) reportSaveError(splitFilePath, result.error);
    return false;
  }
  splitSavedContent = content;
  splitSavedEol = splitEol;
  splitSavedEncoding = splitEncoding;
  splitModified = false;
  updateStatusBar();
  return true;
}

async function saveSplitFileAs() {
  if (!splitEditorView || !window.electronAPI) return false;
  const content = splitEditorView.state.doc.toString();
  const result = await window.electronAPI.saveAs({
    content: content.replace(/\n/g, splitEol),
    defaultPath: splitFilePath || 'untitled.txt',
    encoding: splitEncoding,
  });
  if (!result.success) {
    if (!result.canceled) reportSaveError(result.filePath || 'file', result.error);
    return false;
  }
  splitFilePath = result.filePath;
  splitSavedContent = content;
  splitSavedEol = splitEol;
  splitSavedEncoding = splitEncoding;
  splitModified = false;
  splitEditorView.dispatch({
    effects: splitLanguageCompartment.reconfigure(getLanguageExtension(splitFilePath)),
  });
  updateStatusBar();
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
    ...bookmarkExtensions(),
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
    splitWhitespaceCompartment.of(whitespaceExt()),
    splitEolCompartment.of(showEol ? eolMarkerPlugin(splitEolLabel) : []),
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
        splitModified = computeSplitModified();
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
  splitSavedEol = splitEol;
  splitEncoding = result.encoding || 'utf8';
  splitSavedEncoding = splitEncoding;
  splitSavedContent = content;
  splitModified = false;
  splitEditorView.focus();
  refreshEolMarkers();
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

let compareScrollCleanup = null;

function syncCompareScroll() {
  if (!editorView || !splitEditorView) return;
  if (compareScrollCleanup) compareScrollCleanup();

  let syncing = false;

  const leftScroller = editorView.scrollDOM;
  const rightScroller = splitEditorView.scrollDOM;

  const onLeft = () => {
    if (syncing) return;
    syncing = true;
    rightScroller.scrollTop = leftScroller.scrollTop;
    syncing = false;
  };
  const onRight = () => {
    if (syncing) return;
    syncing = true;
    leftScroller.scrollTop = rightScroller.scrollTop;
    syncing = false;
  };

  leftScroller.addEventListener('scroll', onLeft);
  rightScroller.addEventListener('scroll', onRight);

  compareScrollCleanup = () => {
    leftScroller.removeEventListener('scroll', onLeft);
    rightScroller.removeEventListener('scroll', onRight);
    compareScrollCleanup = null;
  };
}

function closeCompare() {
  compareMode = false;
  compareRightPath = null;
  if (compareScrollCleanup) compareScrollCleanup();

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

const commands = {
  'new': () => createTab(null, ''),
  'save': () => saveCurrentFile(),
  'save-as': () => saveCurrentFileAs(),
  'save-copy-as': () => saveCopyAs(),
  'save-all': () => saveAllTabs(),
  'reload': () => reloadCurrent(),
  'close': () => closeTab(activeTabId),
  'close-all': () => closeAllTabs(),
  'close-others': () => closeTabsWhere(t => t.id !== activeTabId),
  'close-left': () => closeTabsWhere((t, i) => i < tabs.findIndex(x => x.id === activeTabId)),
  'close-right': () => closeTabsWhere((t, i) => i > tabs.findIndex(x => x.id === activeTabId)),
  'close-unchanged': () => closeTabsWhere(t => !t.modified),
  'open-containing-folder': () => openContainingFolder(),
  'open-default-viewer': () => openInDefaultViewer(),
  'summary': () => showSummary(),
  'undo': () => doUndo(),
  'redo': () => doRedo(),
  'copy-path': () => copyToClipboard(currentFilePath()),
  'copy-filename': () => copyToClipboard(currentFilePath() ? getFileName(currentFilePath()) : null),
  'copy-dir': () => {
    const p = currentFilePath();
    if (p) copyToClipboard(p.replace(/\\/g, '/').split('/').slice(0, -1).join('/'));
  },
  'transform': (type) => transformText(type),
  'line-op': (type) => lineOperation(type),
  'toggle-line-comment': () => { const v = editableView(); if (v) toggleComment(v); },
  'toggle-block-comment': () => { const v = editableView(); if (v) toggleBlockComment(v); },
  'set-eol': (eol) => setEol(eol),
  'set-encoding': (enc) => setEncoding(enc),
  'reopen-encoding': (enc) => reloadCurrent(enc),
  'find': () => openFind(),
  'replace': () => openFind(),
  'find-in-files': () => showFindInFiles(),
  'bookmark': (action) => bookmarkCommand(action),
  'goto-line': () => showGotoLineDialog(),
  'toggle-sidebar': () => toggleSidebar(),
  'toggle-minimap': () => toggleMinimap(),
  'toggle-whitespace': () => toggleShowWhitespace(),
  'toggle-eol-markers': () => toggleShowEol(),
  'fold-all': () => foldAll(activeView()),
  'unfold-all': () => unfoldAll(activeView()),
  'toggle-wrap': () => toggleWordWrap(),
  'zoom-in': () => setFontSize(fontSize + 2),
  'zoom-out': () => setFontSize(fontSize - 2),
  'zoom-reset': () => setFontSize(14),
  'toggle-split': () => toggleSplitView(),
  'focus-other-view': () => focusOtherView(),
  'tab': (action) => tabCommand(action),
  'toggle-theme': () => toggleTheme(),
};

function runCommand(name, arg) {
  const fn = commands[name];
  if (fn) fn(arg);
}

// Find in Files
function showFindInFiles() {
  const dialog = document.getElementById('find-files-dialog');
  const query = document.getElementById('fif-query');
  const dirInput = document.getElementById('fif-dir');
  const view = activeView();
  const sel = view ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) : '';
  if (sel && !sel.includes('\n')) query.value = sel;
  if (!dirInput.value) dirInput.value = defaultSearchDir();
  dialog.classList.remove('hidden');
  query.focus();
  query.select();
}

function hideFindInFiles() {
  document.getElementById('find-files-dialog').classList.add('hidden');
}

function defaultSearchDir() {
  if (currentFolderPath) return currentFolderPath;
  const p = currentFilePath();
  if (p) return p.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  return '';
}

async function runFindInFiles() {
  if (!window.electronAPI || !window.electronAPI.findInFiles) return;
  const opts = {
    query: document.getElementById('fif-query').value,
    filters: document.getElementById('fif-filters').value,
    dir: document.getElementById('fif-dir').value.trim(),
    matchCase: document.getElementById('fif-case').checked,
    wholeWord: document.getElementById('fif-word').checked,
    regex: document.getElementById('fif-regex').checked,
    subfolders: document.getElementById('fif-sub').checked,
  };
  if (!opts.query || !opts.dir) return;
  hideFindInFiles();

  const panel = document.getElementById('search-results');
  const title = document.getElementById('search-results-title');
  const list = document.getElementById('search-results-list');
  panel.classList.remove('hidden');
  title.textContent = `Searching for "${opts.query}"...`;
  list.innerHTML = '';

  const result = await window.electronAPI.findInFiles(opts);
  if (!result.success) {
    title.textContent = 'Search failed';
    list.innerHTML = `<div class="sr-empty">${escapeHtml(result.error || 'Unknown error')}</div>`;
    return;
  }
  renderSearchResults(opts.query, result);
}

function renderSearchResults(query, result) {
  const title = document.getElementById('search-results-title');
  const list = document.getElementById('search-results-list');
  const fileCount = result.results.length;
  title.textContent = `"${query}": ${result.total} hit${result.total === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'} (${result.filesSearched} searched)${result.truncated ? ', list truncated' : ''}`;
  list.innerHTML = '';
  if (!fileCount) {
    list.innerHTML = '<div class="sr-empty">No matches found.</div>';
    return;
  }
  for (const file of result.results) {
    const header = document.createElement('div');
    header.className = 'sr-file';
    header.innerHTML = `<span class="sr-toggle">&#9660;</span><span class="sr-path">${escapeHtml(file.filePath)}</span><span class="sr-count">${file.matches.length}</span>`;
    const body = document.createElement('div');
    body.className = 'sr-matches';
    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      header.querySelector('.sr-toggle').innerHTML = collapsed ? '&#9654;' : '&#9660;';
    });
    for (const m of file.matches) {
      const row = document.createElement('div');
      row.className = 'sr-match';
      row.innerHTML = `<span class="sr-line">Line ${m.line}:</span><span class="sr-text">${escapeHtml(m.text.trim())}</span>`;
      row.addEventListener('click', () => openFileAtLine(file.filePath, m.line, m.col));
      body.appendChild(row);
    }
    list.appendChild(header);
    list.appendChild(body);
  }
}

async function openFileAtLine(filePath, lineNumber, col) {
  await openFileFromPath(filePath);
  let view = editorView;
  if (splitEditorView && ((splitMode === 'file' && splitFilePath === filePath)
      || (splitMode === 'tab' && tabs.find(t => t.id === splitTabId && t.filePath === filePath)))) {
    if (focusedPane === 'right') view = splitEditorView;
  }
  const doc = view.state.doc;
  const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
  const pos = Math.min(line.from + Math.max(0, (col || 1) - 1), line.to);
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  });
  view.focus();
}

function initFindInFiles() {
  document.getElementById('fif-ok').addEventListener('click', runFindInFiles);
  document.getElementById('fif-cancel').addEventListener('click', hideFindInFiles);
  document.getElementById('fif-use-current').addEventListener('click', () => {
    document.getElementById('fif-dir').value = defaultSearchDir();
  });
  document.getElementById('find-files-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') runFindInFiles();
    if (e.key === 'Escape') hideFindInFiles();
  });
  document.getElementById('find-files-dialog').addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) hideFindInFiles();
  });
  document.getElementById('search-results-close').addEventListener('click', () => {
    document.getElementById('search-results').classList.add('hidden');
  });
  document.getElementById('status-encoding').addEventListener('click', (e) => showEncodingMenu(e.currentTarget));
  document.getElementById('status-eol').addEventListener('click', (e) => showEolMenu(e.currentTarget));
}

function initTabShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      tabCommand(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      tabCommand(e.shiftKey ? 'move-forward' : 'next');
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      tabCommand(e.shiftKey ? 'move-backward' : 'prev');
    }
  }, true);
}

function wireEvents() {
  document.getElementById('btn-new').addEventListener('click', () => createTab(null, ''));
  document.getElementById('btn-open').addEventListener('click', () => window.electronAPI.openFile());
  document.getElementById('btn-save').addEventListener('click', () => saveCurrentFile());
  document.getElementById('btn-save-as').addEventListener('click', () => saveCurrentFileAs());

  document.getElementById('btn-wrap').addEventListener('click', toggleWordWrap);

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
    window.electronAPI.onFileOpened(({ filePath, content, encoding }) => {
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
      createTab(filePath, content, { encoding });
    });

    window.electronAPI.onFolderOpened(({ folderPath }) => {
      loadFolderTree(folderPath);
    });

    window.electronAPI.onMenuCommand((name, arg) => runCommand(name, arg));

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
  setEditorFont(document.getElementById('font-select').value);
  initSidebarTabs();
  initSidebarResize();
  initSplitGutter();
  initDragAndDrop();
  initGotoLineDialog();
  initProseFind();
  initTabShortcuts();
  initFindInFiles();
  initMinimap();
  loadRecentFiles();
});
