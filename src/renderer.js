import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, highlightWhitespace, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, ViewPlugin, WidgetType, gutter, GutterMarker } from '@codemirror/view';
import { EditorState, Compartment, RangeSetBuilder, StateEffect, StateField, RangeSet } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, copyLineDown, moveLineUp, moveLineDown, toggleComment, toggleBlockComment } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap, foldAll, unfoldAll, StreamLanguage, syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { go } from '@codemirror/legacy-modes/mode/go';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { csharp, kotlin, scala, dart, objectiveC } from '@codemirror/legacy-modes/mode/clike';
import { haskell } from '@codemirror/legacy-modes/mode/haskell';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { r } from '@codemirror/legacy-modes/mode/r';
import { pascal } from '@codemirror/legacy-modes/mode/pascal';
import { fortran } from '@codemirror/legacy-modes/mode/fortran';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import { vbScript } from '@codemirror/legacy-modes/mode/vbscript';
import { tcl } from '@codemirror/legacy-modes/mode/tcl';
import { scheme } from '@codemirror/legacy-modes/mode/scheme';
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp';
import { clojure } from '@codemirror/legacy-modes/mode/clojure';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { nsis } from '@codemirror/legacy-modes/mode/nsis';
import { cmake } from '@codemirror/legacy-modes/mode/cmake';
import { groovy } from '@codemirror/legacy-modes/mode/groovy';
import { julia } from '@codemirror/legacy-modes/mode/julia';
import { octave } from '@codemirror/legacy-modes/mode/octave';
import { sas } from '@codemirror/legacy-modes/mode/sas';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { vhdl } from '@codemirror/legacy-modes/mode/vhdl';
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript';
import { cobol } from '@codemirror/legacy-modes/mode/cobol';
import { d } from '@codemirror/legacy-modes/mode/d';
import { gas } from '@codemirror/legacy-modes/mode/gas';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { crystal } from '@codemirror/legacy-modes/mode/crystal';
import { elm } from '@codemirror/legacy-modes/mode/elm';
import { oCaml, fSharp } from '@codemirror/legacy-modes/mode/mllike';
import { smalltalk } from '@codemirror/legacy-modes/mode/smalltalk';
import { protobuf } from '@codemirror/legacy-modes/mode/protobuf';
import { sass } from '@codemirror/legacy-modes/mode/sass';
import { stylus } from '@codemirror/legacy-modes/mode/stylus';
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

const stream = (mode) => () => StreamLanguage.define(mode);

const LANG_DEFS = [
  { key: 'plain', name: 'Plain Text', exts: ['.txt', '.log', '.text'], load: null },
  { key: 'javascript', name: 'JavaScript', exts: ['.js', '.mjs', '.cjs'], load: () => javascript() },
  { key: 'jsx', name: 'JSX', exts: ['.jsx'], load: () => javascript({ jsx: true }) },
  { key: 'typescript', name: 'TypeScript', exts: ['.ts', '.mts', '.cts'], load: () => javascript({ typescript: true }) },
  { key: 'tsx', name: 'TSX', exts: ['.tsx'], load: () => javascript({ typescript: true, jsx: true }) },
  { key: 'html', name: 'HTML', exts: ['.html', '.htm', '.xhtml'], load: () => html() },
  { key: 'css', name: 'CSS', exts: ['.css', '.scss', '.less'], load: () => css() },
  { key: 'python', name: 'Python', exts: ['.py', '.pyw', '.pyi'], load: () => python() },
  { key: 'json', name: 'JSON', exts: ['.json', '.json5', '.jsonc'], load: () => json() },
  { key: 'markdown', name: 'Markdown', exts: ['.md', '.markdown', '.mdown'], load: () => markdown() },
  { key: 'xml', name: 'XML', exts: ['.xml', '.svg', '.xsl', '.xslt', '.xsd', '.plist', '.csproj', '.vcxproj'], load: () => xml() },
  { key: 'c', name: 'C', exts: ['.c', '.h'], load: () => cpp() },
  { key: 'cpp', name: 'C++', exts: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.ino'], load: () => cpp() },
  { key: 'java', name: 'Java', exts: ['.java'], load: () => java() },
  { key: 'php', name: 'PHP', exts: ['.php', '.phtml'], load: () => php() },
  { key: 'rust', name: 'Rust', exts: ['.rs'], load: () => rust() },
  { key: 'sql', name: 'SQL', exts: ['.sql'], load: () => sql() },
  { key: 'shell', name: 'Shell', exts: ['.sh', '.bash', '.zsh', '.ksh'], load: stream(shell) },
  { key: 'powershell', name: 'PowerShell', exts: ['.ps1', '.psm1', '.psd1'], load: stream(powerShell) },
  { key: 'yaml', name: 'YAML', exts: ['.yml', '.yaml'], load: stream(yaml) },
  { key: 'toml', name: 'TOML', exts: ['.toml'], load: stream(toml) },
  { key: 'ini', name: 'INI', exts: ['.ini', '.cfg', '.conf', '.properties', '.env'], load: stream(properties) },
  { key: 'lua', name: 'Lua', exts: ['.lua'], load: stream(lua) },
  { key: 'ruby', name: 'Ruby', exts: ['.rb', '.rake', '.gemspec'], load: stream(ruby) },
  { key: 'perl', name: 'Perl', exts: ['.pl', '.pm', '.t'], load: stream(perl) },
  { key: 'go', name: 'Go', exts: ['.go'], load: stream(go) },
  { key: 'swift', name: 'Swift', exts: ['.swift'], load: stream(swift) },
  { key: 'csharp', name: 'C#', exts: ['.cs'], load: stream(csharp) },
  { key: 'kotlin', name: 'Kotlin', exts: ['.kt', '.kts'], load: stream(kotlin) },
  { key: 'scala', name: 'Scala', exts: ['.scala', '.sc'], load: stream(scala) },
  { key: 'dart', name: 'Dart', exts: ['.dart'], load: stream(dart) },
  { key: 'objectivec', name: 'Objective-C', exts: ['.mm'], load: stream(objectiveC) },
  { key: 'haskell', name: 'Haskell', exts: ['.hs', '.lhs'], load: stream(haskell) },
  { key: 'erlang', name: 'Erlang', exts: ['.erl', '.hrl'], load: stream(erlang) },
  { key: 'r', name: 'R', exts: ['.r', '.rmd'], load: stream(r) },
  { key: 'pascal', name: 'Pascal', exts: ['.pas', '.pp', '.dpr'], load: stream(pascal) },
  { key: 'fortran', name: 'Fortran', exts: ['.f', '.for', '.f90', '.f95', '.f03'], load: stream(fortran) },
  { key: 'vb', name: 'Visual Basic', exts: ['.vb', '.bas'], load: stream(vb) },
  { key: 'vbscript', name: 'VBScript', exts: ['.vbs'], load: stream(vbScript) },
  { key: 'tcl', name: 'TCL', exts: ['.tcl'], load: stream(tcl) },
  { key: 'scheme', name: 'Scheme', exts: ['.scm', '.ss', '.rkt'], load: stream(scheme) },
  { key: 'lisp', name: 'Lisp', exts: ['.lisp', '.cl', '.el'], load: stream(commonLisp) },
  { key: 'clojure', name: 'Clojure', exts: ['.clj', '.cljs', '.edn'], load: stream(clojure) },
  { key: 'latex', name: 'LaTeX', exts: ['.tex', '.latex', '.sty', '.bib'], load: stream(stex) },
  { key: 'nsis', name: 'NSIS', exts: ['.nsi', '.nsh'], load: stream(nsis) },
  { key: 'cmake', name: 'CMake', exts: ['.cmake'], load: stream(cmake) },
  { key: 'groovy', name: 'Groovy', exts: ['.groovy', '.gradle', '.gvy'], load: stream(groovy) },
  { key: 'julia', name: 'Julia', exts: ['.jl'], load: stream(julia) },
  { key: 'matlab', name: 'MATLAB', exts: ['.m'], load: stream(octave) },
  { key: 'sas', name: 'SAS', exts: ['.sas'], load: stream(sas) },
  { key: 'verilog', name: 'Verilog', exts: ['.v', '.sv', '.svh'], load: stream(verilog) },
  { key: 'vhdl', name: 'VHDL', exts: ['.vhd', '.vhdl'], load: stream(vhdl) },
  { key: 'coffeescript', name: 'CoffeeScript', exts: ['.coffee'], load: stream(coffeeScript) },
  { key: 'cobol', name: 'COBOL', exts: ['.cob', '.cbl', '.cpy'], load: stream(cobol) },
  { key: 'd', name: 'D', exts: ['.d'], load: stream(d) },
  { key: 'assembly', name: 'Assembly', exts: ['.s', '.asm'], load: stream(gas) },
  { key: 'nginx', name: 'NGINX', exts: [], load: stream(nginx) },
  { key: 'dockerfile', name: 'Dockerfile', exts: ['.dockerfile'], load: stream(dockerFile) },
  { key: 'diff', name: 'Diff', exts: ['.diff', '.patch'], load: stream(diffMode) },
  { key: 'crystal', name: 'Crystal', exts: ['.cr'], load: stream(crystal) },
  { key: 'elm', name: 'Elm', exts: ['.elm'], load: stream(elm) },
  { key: 'ocaml', name: 'OCaml', exts: ['.ml', '.mli'], load: stream(oCaml) },
  { key: 'fsharp', name: 'F#', exts: ['.fs', '.fsx', '.fsi'], load: stream(fSharp) },
  { key: 'smalltalk', name: 'Smalltalk', exts: ['.st'], load: stream(smalltalk) },
  { key: 'protobuf', name: 'Protocol Buffers', exts: ['.proto'], load: stream(protobuf) },
  { key: 'sass', name: 'Sass', exts: ['.sass'], load: stream(sass) },
  { key: 'stylus', name: 'Stylus', exts: ['.styl'], load: stream(stylus) },
];

const LANG_BY_KEY = Object.fromEntries(LANG_DEFS.map(l => [l.key, l]));
const LANG_BY_EXT = {};
for (const lang of LANG_DEFS) for (const ext of lang.exts) LANG_BY_EXT[ext] = lang.key;

const LANG_BY_FILENAME = {
  'dockerfile': 'dockerfile',
  'containerfile': 'dockerfile',
  'cmakelists.txt': 'cmake',
  'nginx.conf': 'nginx',
  'makefile': 'shell',
  'gnumakefile': 'shell',
  'rakefile': 'ruby',
  'gemfile': 'ruby',
  'vagrantfile': 'ruby',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.zshrc': 'shell',
  '.profile': 'shell',
  '.gitconfig': 'ini',
  '.editorconfig': 'ini',
  'package.json': 'json',
};

const SHEBANG_RULES = [
  [/python/, 'python'],
  [/node|deno|bun/, 'javascript'],
  [/\b(ba|z|k|da)?sh\b/, 'shell'],
  [/perl/, 'perl'],
  [/ruby/, 'ruby'],
  [/php/, 'php'],
  [/lua/, 'lua'],
  [/pwsh|powershell/, 'powershell'],
  [/tclsh|wish/, 'tcl'],
];

const langExtCache = new Map();

function languageExtensionFor(key) {
  const lang = LANG_BY_KEY[key];
  if (!lang || !lang.load) return [];
  if (!langExtCache.has(key)) langExtCache.set(key, lang.load());
  return [langExtCache.get(key)];
}

function languageName(key) {
  return (LANG_BY_KEY[key] || LANG_BY_KEY.plain).name;
}

function detectLanguageKey(filePath, content) {
  if (filePath) {
    const name = getFileName(filePath).toLowerCase();
    if (LANG_BY_FILENAME[name]) return LANG_BY_FILENAME[name];
    const ext = getFileExtension(filePath);
    if (ext && LANG_BY_EXT[ext]) return LANG_BY_EXT[ext];
  }
  if (content && content.startsWith('#!')) {
    const firstLine = content.slice(0, content.indexOf('\n') < 0 ? content.length : content.indexOf('\n'));
    for (const [re, key] of SHEBANG_RULES) {
      if (re.test(firstLine)) return key;
    }
  }
  if (content && /^\s*<\?xml/.test(content)) return 'xml';
  if (content && /^\s*<(!doctype html|html)/i.test(content)) return 'html';
  return 'plain';
}

function languageMenuList() {
  return LANG_DEFS
    .map(l => ({ key: l.key, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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

// Change history margin
const markSavedEffect = StateEffect.define();
const clearHistoryEffect = StateEffect.define();
const changeHistoryCompartment = new Compartment();
const splitChangeHistoryCompartment = new Compartment();
let showChangeHistory = true;

class ChangeMarker extends GutterMarker {
  constructor(kind) {
    super();
    this.kind = kind;
  }
  eq(other) {
    return other.kind === this.kind;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-change-bar cm-change-' + this.kind;
    return el;
  }
}
const unsavedMarker = new ChangeMarker('unsaved');
const savedMarker = new ChangeMarker('saved');

function rebuildChangeSet(entries, doc) {
  const byLine = new Map();
  for (const [pos, kind] of entries) {
    const from = doc.lineAt(Math.min(pos, doc.length)).from;
    if (kind === 'unsaved' || !byLine.has(from)) byLine.set(from, kind);
  }
  return RangeSet.of(
    [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([from, kind]) => (kind === 'unsaved' ? unsavedMarker : savedMarker).range(from))
  );
}

const changeHistoryField = StateField.define({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    for (const e of tr.effects) {
      if (e.is(clearHistoryEffect)) return RangeSet.empty;
    }
    if (tr.docChanged) {
      set = set.map(tr.changes);
      const entries = [];
      const iter = set.iter();
      while (iter.value) {
        entries.push([iter.from, iter.value.kind]);
        iter.next();
      }
      const doc = tr.state.doc;
      tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        const first = doc.lineAt(fromB).number;
        const last = doc.lineAt(Math.min(toB, doc.length)).number;
        for (let n = first; n <= last; n++) entries.push([doc.line(n).from, 'unsaved']);
      });
      set = rebuildChangeSet(entries, doc);
    }
    for (const e of tr.effects) {
      if (e.is(markSavedEffect)) {
        const entries = [];
        const iter = set.iter();
        while (iter.value) {
          entries.push([iter.from, 'saved']);
          iter.next();
        }
        set = rebuildChangeSet(entries, tr.state.doc);
      }
    }
    return set;
  },
});

const changeHistoryGutter = gutter({
  class: 'cm-change-gutter',
  markers: v => v.state.field(changeHistoryField),
  initialSpacer: () => unsavedMarker,
});

function changeHistoryExtensions(compartment) {
  return [changeHistoryField, compartment.of(showChangeHistory ? changeHistoryGutter : [])];
}

function toggleChangeHistory() {
  showChangeHistory = !showChangeHistory;
  editorView.dispatch({ effects: changeHistoryCompartment.reconfigure(showChangeHistory ? changeHistoryGutter : []) });
  if (splitEditorView) {
    splitEditorView.dispatch({ effects: splitChangeHistoryCompartment.reconfigure(showChangeHistory ? changeHistoryGutter : []) });
  }
}

function markTabHistorySaved(tab) {
  const effect = markSavedEffect.of(null);
  if (tab.id === activeTabId) {
    editorView.dispatch({ effects: effect });
  } else if (tab.state) {
    tab.state = tab.state.update({ effects: effect }).state;
  }
  if (splitEditorView && ((splitMode === 'tab' && splitTabId === tab.id) || (splitMode === 'clone' && tab.id === activeTabId))) {
    splitEditorView.dispatch({ effects: effect });
  }
}

function changedLines(state) {
  const lines = [];
  const iter = state.field(changeHistoryField).iter();
  while (iter.value) {
    lines.push(state.doc.lineAt(iter.from).number);
    iter.next();
  }
  return lines;
}

function gotoChange(view, direction) {
  const lines = changedLines(view.state);
  if (!lines.length) return;
  const current = view.state.doc.lineAt(view.state.selection.main.head).number;
  let target;
  if (direction > 0) target = lines.find(n => n > current) ?? lines[0];
  else target = [...lines].reverse().find(n => n < current) ?? lines[lines.length - 1];
  const line = view.state.doc.line(target);
  view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  view.focus();
}

function changeHistoryCommand(action) {
  const view = activeView();
  if (!view) return;
  if (action === 'next') gotoChange(view, 1);
  else if (action === 'prev') gotoChange(view, -1);
  else if (action === 'clear') view.dispatch({ effects: clearHistoryEffect.of(null) });
  else if (action === 'toggle') toggleChangeHistory();
}

// Column editor
function columnEditorTargets(view) {
  const state = view.state;
  const doc = state.doc;
  const ranges = state.selection.ranges;
  if (ranges.length > 1) {
    return [...ranges]
      .sort((a, b) => a.from - b.from)
      .map(r => ({ from: r.from, to: r.to, pad: 0 }));
  }
  const main = state.selection.main;
  const startLine = doc.lineAt(main.from);
  const col = main.from - startLine.from;
  const endLineNo = main.empty ? doc.lines : doc.lineAt(main.to).number;
  const targets = [];
  for (let n = startLine.number; n <= endLineNo; n++) {
    const line = doc.line(n);
    if (line.length >= col) targets.push({ from: line.from + col, to: line.from + col, pad: 0 });
    else targets.push({ from: line.to, to: line.to, pad: col - line.length });
  }
  return targets;
}

function columnEditorValues(count, opts) {
  if (opts.mode === 'text') return Array(count).fill(opts.text || '');
  const radix = { dec: 10, hex: 16, oct: 8, bin: 2 }[opts.format] || 10;
  const repeat = Math.max(1, opts.repeat || 1);
  const raw = [];
  for (let i = 0; i < count; i++) raw.push(opts.initial + opts.step * Math.floor(i / repeat));
  const strs = raw.map(v => (v < 0 ? '-' : '') + Math.abs(Math.trunc(v)).toString(radix).toUpperCase());
  if (!opts.leadingZeros) return strs;
  const width = Math.max(...strs.map(s => s.replace('-', '').length));
  return strs.map(s => (s.startsWith('-') ? '-' + s.slice(1).padStart(width, '0') : s.padStart(width, '0')));
}

function applyColumnEditor(opts) {
  const view = editableView();
  if (!view) return;
  const targets = columnEditorTargets(view);
  if (!targets.length) return;
  const values = columnEditorValues(targets.length, opts);
  const changes = targets.map((t, i) => ({ from: t.from, to: t.to, insert: ' '.repeat(t.pad) + values[i] }));
  view.dispatch({ changes });
  view.focus();
}

function showColumnEditor() {
  const dialog = document.getElementById('column-dialog');
  dialog.classList.remove('hidden');
  updateColumnEditorMode();
  const mode = document.querySelector('input[name="col-mode"]:checked').value;
  document.getElementById(mode === 'text' ? 'col-text' : 'col-initial').focus();
}

function hideColumnEditor() {
  document.getElementById('column-dialog').classList.add('hidden');
  activeView().focus();
}

function updateColumnEditorMode() {
  const mode = document.querySelector('input[name="col-mode"]:checked').value;
  document.getElementById('col-text-fields').classList.toggle('disabled', mode !== 'text');
  document.getElementById('col-number-fields').classList.toggle('disabled', mode !== 'number');
}

function executeColumnEditor() {
  const mode = document.querySelector('input[name="col-mode"]:checked').value;
  const opts = {
    mode,
    text: document.getElementById('col-text').value,
    initial: parseInt(document.getElementById('col-initial').value, 10) || 0,
    step: parseInt(document.getElementById('col-step').value, 10) || 0,
    repeat: parseInt(document.getElementById('col-repeat').value, 10) || 1,
    leadingZeros: document.getElementById('col-zeros').checked,
    format: document.querySelector('input[name="col-format"]:checked').value,
  };
  hideColumnEditor();
  applyColumnEditor(opts);
}

function initColumnEditor() {
  document.querySelectorAll('input[name="col-mode"]').forEach(el => el.addEventListener('change', updateColumnEditorMode));
  document.getElementById('col-ok').addEventListener('click', executeColumnEditor);
  document.getElementById('col-cancel').addEventListener('click', hideColumnEditor);
  document.getElementById('column-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') executeColumnEditor();
    if (e.key === 'Escape') hideColumnEditor();
  });
  document.getElementById('column-dialog').addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) hideColumnEditor();
  });
}

// Closer detector
const CLOSER_PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSER_OPENERS = { ')': '(', ']': '[', '}': '{' };
const C_LIKE = new Set(['javascript', 'jsx', 'typescript', 'tsx', 'java', 'c', 'cpp', 'php', 'rust', 'go', 'swift', 'kotlin', 'csharp', 'scala', 'dart', 'objectivec', 'd', 'groovy', 'json']);
const HASH_COMMENT = new Set(['python', 'shell', 'ruby', 'perl', 'yaml', 'toml', 'ini', 'powershell', 'r', 'julia', 'cmake', 'dockerfile', 'nginx', 'crystal', 'elm', 'coffeescript', 'tcl']);
const DASH_COMMENT = new Set(['sql', 'lua', 'haskell', 'vhdl']);
const MARKUP = new Set(['html', 'xml', 'markdown']);
const PROSE = new Set(['plain', 'markdown', 'latex']);
const BACKTICK_LANGS = new Set(['javascript', 'jsx', 'typescript', 'tsx', 'shell', 'go', 'markdown']);

let closerMarks = [];
let closerIssues = [];

function closerScan(text, langKey, checkQuotes) {
  const issues = [];
  const marks = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (pos) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const lineText = (n) => text.slice(lineStarts[n - 1], n < lineStarts.length ? lineStarts[n] - 1 : text.length);
  const indentOf = (s) => (/^\s*/.exec(s)[0]).length;

  const prose = PROSE.has(langKey);
  const cLike = C_LIKE.has(langKey) || langKey === 'css';
  const hash = HASH_COMMENT.has(langKey);
  const dash = DASH_COMMENT.has(langKey);
  const markup = MARKUP.has(langKey);
  const singleQuotes = checkQuotes && !prose && !markup;
  const doubleQuotes = checkQuotes && !prose;
  const backticks = checkQuotes && BACKTICK_LANGS.has(langKey);
  const triple = langKey === 'python';

  const stack = [];
  let i = 0;
  const n = text.length;

  const suggestBlockClosePos = (openPos) => {
    const openLine = lineOf(openPos);
    const baseIndent = indentOf(lineText(openLine));
    for (let ln = openLine + 1; ln < lineStarts.length; ln++) {
      const s = lineText(ln);
      if (!s.trim()) continue;
      if (indentOf(s) <= baseIndent) {
        let prev = ln - 1;
        while (prev > openLine && !lineText(prev).trim()) prev--;
        return lineStarts[prev - 1] + lineText(prev).length;
      }
    }
    const last = lineStarts.length;
    return lineStarts[last - 1] + lineText(last).length;
  };

  const suggestInlineClosePos = (openPos) => {
    const ln = lineOf(openPos);
    const s = lineText(ln);
    let t = s.replace(/\s+$/, '');
    if (/[;,{]$/.test(t)) t = t.slice(0, -1).replace(/\s+$/, '');
    const pos = lineStarts[ln - 1] + t.length;
    return Math.max(openPos + 1, pos);
  };

  const suggestClosePos = (open, limit) => {
    let pos = open.char === '{' ? suggestBlockClosePos(open.pos) : suggestInlineClosePos(open.pos);
    if (limit != null) {
      if (lineOf(open.pos) === lineOf(limit) || pos > limit) pos = limit;
    }
    return pos;
  };

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (cLike && ch === '/' && next === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (cLike && ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
    if (hash && ch === '#') { while (i < n && text[i] !== '\n') i++; continue; }
    if (dash && ch === '-' && next === '-') { while (i < n && text[i] !== '\n') i++; continue; }
    if (markup && text.startsWith('<!--', i)) { const end = text.indexOf('-->', i + 4); i = end < 0 ? n : end + 3; continue; }

    if (triple && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const q = text.slice(i, i + 3);
      const end = text.indexOf(q, i + 3);
      if (end < 0) {
        issues.push({ kind: 'quote', char: q, pos: i, line: lineOf(i), message: `Unclosed ${q} string opened on line ${lineOf(i)}` });
        marks.push({ from: i, to: i + 3, cls: 'cm-closer-open' });
        i = n;
      } else i = end + 3;
      continue;
    }

    if ((ch === '"' && doubleQuotes) || (ch === "'" && singleQuotes) || (ch === '`' && backticks)) {
      const multi = ch === '`';
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === ch) { closed = true; break; }
        if (text[j] === '\n' && !multi) break;
        j++;
      }
      if (!closed) {
        if (prose && ch === '"') {
          i++;
          continue;
        }
        issues.push({ kind: 'quote', char: ch, pos: i, line: lineOf(i), message: `Unclosed ${ch} quote on line ${lineOf(i)}` });
        marks.push({ from: i, to: i + 1, cls: 'cm-closer-open' });
        i = multi ? n : j;
        continue;
      }
      i = j + 1;
      continue;
    }

    if (CLOSER_PAIRS[ch]) {
      stack.push({ char: ch, pos: i });
    } else if (CLOSER_OPENERS[ch]) {
      const want = CLOSER_OPENERS[ch];
      if (stack.length && stack[stack.length - 1].char === want) {
        stack.pop();
      } else {
        const idx = stack.map(s => s.char).lastIndexOf(want);
        if (idx < 0) {
          issues.push({ kind: 'extra', char: ch, pos: i, line: lineOf(i), message: `Extra ${ch} on line ${lineOf(i)} with no matching ${want}` });
          marks.push({ from: i, to: i + 1, cls: 'cm-closer-extra' });
        } else {
          for (let k = stack.length - 1; k > idx; k--) {
            const open = stack[k];
            const closer = CLOSER_PAIRS[open.char];
            const insertAt = suggestClosePos(open, i);
            issues.push({ kind: 'missing', char: closer, pos: open.pos, line: lineOf(open.pos), insertAt, message: `Missing ${closer} for ${open.char} opened on line ${lineOf(open.pos)}; probably belongs on line ${lineOf(insertAt)} (must come before ${ch} on line ${lineOf(i)})` });
            marks.push({ from: open.pos, to: open.pos + 1, cls: 'cm-closer-open' });
            marks.push({ from: insertAt, to: insertAt, widget: closer });
          }
          stack.length = idx;
        }
      }
    }
    i++;
  }

  if (prose) {
    const paragraphs = text.split(/\n\s*\n/);
    let offset = 0;
    for (const para of paragraphs) {
      const count = (para.match(/"/g) || []).length;
      if (count % 2 === 1) {
        const last = offset + para.lastIndexOf('"');
        issues.push({ kind: 'quote', char: '"', pos: last, line: lineOf(last), message: `Odd number of double quotes in the paragraph ending on line ${lineOf(last)}` });
        marks.push({ from: last, to: last + 1, cls: 'cm-closer-open' });
      }
      offset += para.length;
      const sepMatch = /\n\s*\n/.exec(text.slice(offset));
      offset += sepMatch ? sepMatch[0].length : 0;
    }
  }

  for (const open of stack) {
    const closer = CLOSER_PAIRS[open.char];
    const insertAt = suggestClosePos(open, null);
    issues.push({ kind: 'missing', char: closer, pos: open.pos, line: lineOf(open.pos), insertAt, message: `Unclosed ${open.char} opened on line ${lineOf(open.pos)}; ${closer} probably belongs at the end of line ${lineOf(insertAt)}` });
    marks.push({ from: open.pos, to: open.pos + 1, cls: 'cm-closer-open' });
    marks.push({ from: insertAt, to: insertAt, widget: closer });
  }

  issues.sort((a, b) => a.pos - b.pos);
  return { issues, marks };
}

class CloserHintWidget extends WidgetType {
  constructor(ch) {
    super();
    this.ch = ch;
  }
  eq(other) {
    return other.ch === this.ch;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-closer-hint';
    span.textContent = this.ch;
    span.title = 'A closing ' + this.ch + ' probably belongs here';
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

function buildCloserDecorations(view) {
  const docLen = view.state.doc.length;
  const sorted = [...closerMarks].filter(m => m.from <= docLen && m.to <= docLen).sort((a, b) => a.from - b.from || (a.widget ? 1 : 0) - (b.widget ? 1 : 0));
  const builder = new RangeSetBuilder();
  for (const m of sorted) {
    if (m.widget) builder.add(m.from, m.from, Decoration.widget({ widget: new CloserHintWidget(m.widget), side: 1 }));
    else if (m.to > m.from) builder.add(m.from, m.to, Decoration.mark({ class: m.cls }));
  }
  return builder.finish();
}

const closerPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildCloserDecorations(view);
  }
  update(update) {
    if (update.docChanged) {
      closerMarks = [];
      this.decorations = Decoration.none;
      const status = document.getElementById('closer-status');
      if (closerIssues.length && status && !document.getElementById('closer-panel').classList.contains('hidden')) {
        status.textContent = 'Document changed, re-check';
      }
    } else if (update.viewportChanged || hasRefreshEffect(update)) {
      this.decorations = buildCloserDecorations(update.view);
    }
  }
}, { decorations: v => v.decorations });

let closerView = null;

function runCloserCheck() {
  const target = statusTarget();
  const view = target.view;
  closerView = view;
  const checkQuotes = document.getElementById('closer-quotes').checked;
  const { issues, marks } = closerScan(view.state.doc.toString(), target.language, checkQuotes);
  closerIssues = issues;
  closerMarks = marks;

  document.getElementById('grammar-panel').classList.add('hidden');
  document.getElementById('btn-grammar').classList.remove('active');
  document.getElementById('closer-panel').classList.remove('hidden');
  document.getElementById('btn-closers').classList.add('active');
  document.getElementById('closer-status').textContent = issues.length === 0
    ? 'All closers balanced'
    : `${issues.length} issue${issues.length === 1 ? '' : 's'}`;

  view.dispatch({ effects: refreshDecorations.of(null) });
  renderCloserResults();
}

function closeCloserPanel() {
  closerIssues = [];
  closerMarks = [];
  document.getElementById('closer-panel').classList.add('hidden');
  document.getElementById('btn-closers').classList.remove('active');
  if (closerView) closerView.dispatch({ effects: refreshDecorations.of(null) });
}

function renderCloserResults() {
  const container = document.getElementById('closer-results');
  container.innerHTML = '';
  if (!closerIssues.length) {
    container.innerHTML = '<div class="sidebar-placeholder">No missing or extra closers found.</div>';
    return;
  }
  for (const issue of closerIssues) {
    const item = document.createElement('div');
    item.className = 'grammar-item';
    const label = issue.kind === 'missing' ? 'missing' : issue.kind === 'extra' ? 'extra' : 'quote';
    const cls = issue.kind === 'missing' ? 'error' : issue.kind === 'extra' ? 'typo' : 'style';
    item.innerHTML = `<span class="grammar-item-type ${cls}">${label.toUpperCase()}</span>`
      + `<div class="grammar-item-body"><div class="grammar-item-message">${escapeHtml(issue.message)}</div></div>`
      + (issue.kind === 'missing' ? `<button class="grammar-item-fix">Insert ${escapeHtml(issue.char)}</button>` : '');
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('grammar-item-fix')) return;
      jumpToPos(closerView, issue.pos);
    });
    const fix = item.querySelector('.grammar-item-fix');
    if (fix) {
      fix.addEventListener('click', () => {
        const pos = Math.min(issue.insertAt, closerView.state.doc.length);
        closerView.dispatch({ changes: { from: pos, to: pos, insert: issue.char }, selection: { anchor: pos + 1 } });
        closerView.focus();
        runCloserCheck();
      });
    }
    container.appendChild(item);
  }
}

function jumpToPos(view, pos) {
  if (!view) return;
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p, head: Math.min(p + 1, view.state.doc.length) }, effects: EditorView.scrollIntoView(p, { y: 'center' }) });
  view.focus();
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

function getLanguageExtension(filePath, content) {
  return languageExtensionFor(detectLanguageKey(filePath, content));
}

function tabDisplayName(tab) {
  if (!tab) return 'Untitled';
  if (tab.filePath) return getFileName(tab.filePath);
  return tab.title || 'Untitled';
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
    language: opts.language || detectLanguageKey(filePath, content),
    title: opts.title || null,
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
      languageCompartment.of(languageExtensionFor(tab.language)),
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
      changeHistoryCompartment.reconfigure(showChangeHistory ? changeHistoryGutter : []),
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
      language: t.language,
      title: t.title || null,
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
    const opts = {
      cursorPos: saved.cursorPos || 0,
      scrollPos: saved.scrollPos || 0,
      language: LANG_BY_KEY[saved.language] ? saved.language : undefined,
      title: saved.title || null,
    };
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
  scheduleFunctionListRefresh();
  if (linkMapOpen && linkGraph) renderLinkMap();
}

async function confirmDiscard(message) {
  if (!window.electronAPI || !window.electronAPI.confirmClose) return 1;
  return window.electronAPI.confirmClose({ message });
}

async function closeTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  if (tab.modified) {
    const choice = await confirmDiscard(`Save changes to ${tabDisplayName(tab)}?`);
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
    name.textContent = tabDisplayName(tab);

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

  // Keyboard operation: arrows, Home/End, type-ahead, Enter, Escape.
  const entries = Array.from(menu.querySelectorAll('.ctx-item:not(.disabled)'));
  let active = Math.max(0, entries.findIndex(el => el.classList.contains('checked')));
  const setActive = (i) => {
    if (!entries.length) return;
    active = (i + entries.length) % entries.length;
    entries.forEach((el, k) => el.classList.toggle('active', k === active));
    entries[active].scrollIntoView({ block: 'nearest' });
  };
  let typed = '';
  let typedTimer = null;
  const typeAhead = (ch) => {
    clearTimeout(typedTimer);
    typed += ch.toLowerCase();
    typedTimer = setTimeout(() => { typed = ''; }, 800);
    const start = typed.length === 1 ? active + 1 : active;
    for (let k = 0; k < entries.length; k++) {
      const idx = (start + k) % entries.length;
      if (entries[idx].textContent.toLowerCase().startsWith(typed)) { setActive(idx); return; }
    }
  };

  const removeListeners = () => {
    clearTimeout(typedTimer);
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', dismiss);
  };
  const cleanup = () => {
    hideTabContextMenu();
    removeListeners();
  };
  const dismiss = (ev) => {
    if (ev.type === 'mousedown' && menu.contains(ev.target)) return;
    cleanup();
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); cleanup(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(active + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(active - 1); return; }
    if (ev.key === 'Home') { ev.preventDefault(); setActive(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); setActive(entries.length - 1); return; }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      removeListeners();
      if (entries[active]) entries[active].click(); else hideTabContextMenu();
      return;
    }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) { ev.preventDefault(); typeAhead(ev.key); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); }
  };
  // A mouse pick also ends keyboard capture.
  menu.addEventListener('click', removeListeners, true);
  document.addEventListener('mousedown', dismiss, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', dismiss);
  setActive(active);
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
    ['Rename...', () => showRenameDialog(tab)],
    ['Reload from Disk', () => reloadTab(tab), !tab.filePath],
    ['Print...', () => printTab(tab)],
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

// Rename
let renameTarget = null;

function showRenameDialog(tab) {
  const target = tab ? { kind: 'tab', tab } : (rightPaneTarget() === 'file' ? { kind: 'split' } : { kind: 'tab', tab: getActiveTab() });
  if (target.kind === 'tab' && !target.tab) return;
  if (target.kind === 'tab' && rightPaneTarget() === 'tab' && !tab) target.tab = tabs.find(t => t.id === splitTabId) || target.tab;
  renameTarget = target;
  const dialog = document.getElementById('rename-dialog');
  const input = document.getElementById('rename-input');
  const current = target.kind === 'split' ? getFileName(splitFilePath) : tabDisplayName(target.tab);
  input.value = current;
  dialog.classList.remove('hidden');
  input.focus();
  const dot = current.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : current.length);
}

function hideRenameDialog() {
  document.getElementById('rename-dialog').classList.add('hidden');
  renameTarget = null;
  activeView().focus();
}

async function executeRename() {
  const target = renameTarget;
  const newName = document.getElementById('rename-input').value.trim();
  if (!target || !newName || /[\\/]/.test(newName)) {
    hideRenameDialog();
    return;
  }

  if (target.kind === 'tab' && !target.tab.filePath) {
    target.tab.title = newName;
    renderTabs();
    updateStatusBar();
    hideRenameDialog();
    return;
  }

  const oldPath = target.kind === 'split' ? splitFilePath : target.tab.filePath;
  const sep = oldPath.includes('\\') ? '\\' : '/';
  const dir = oldPath.slice(0, oldPath.lastIndexOf(sep));
  const newPath = dir + sep + newName;
  hideRenameDialog();
  if (newPath === oldPath) return;

  const result = await window.electronAPI.renameFile({ oldPath, newPath });
  if (!result.success) {
    reportSaveError(oldPath, result.error);
    return;
  }

  if (target.kind === 'split') {
    splitFilePath = newPath;
    splitLanguage = detectLanguageKey(newPath, splitEditorView.state.doc.toString());
    splitEditorView.dispatch({ effects: splitLanguageCompartment.reconfigure(languageExtensionFor(splitLanguage)) });
  } else {
    target.tab.filePath = newPath;
    target.tab.language = detectLanguageKey(newPath, tabContent(target.tab));
    applyTabLanguage(target.tab);
  }
  await window.electronAPI.trackRecentFile({ filePath: newPath });
  renderTabs();
  updateStatusBar();
}

function initRenameDialog() {
  document.getElementById('rename-ok').addEventListener('click', executeRename);
  document.getElementById('rename-cancel').addEventListener('click', hideRenameDialog);
  document.getElementById('rename-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeRename();
    if (e.key === 'Escape') hideRenameDialog();
  });
  document.getElementById('rename-dialog').addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) hideRenameDialog();
  });
}

// Print
function printTab(tab) {
  if (!window.electronAPI || !window.electronAPI.printText) return;
  const text = tab ? tabContent(tab) : statusTarget().view.state.doc.toString();
  const title = tab ? tabDisplayName(tab) : (getFileName(statusTarget().filePath) || 'Untitled');
  window.electronAPI.printText({
    title,
    text,
    fontFamily: currentFontFamily || "'Consolas', 'Courier New', monospace",
    fontSize: Math.max(6, Math.round(fontSize * 0.75)),
  });
}

function printCurrent() {
  const target = rightPaneTarget();
  if (target === 'tab') return printTab(tabs.find(t => t.id === splitTabId));
  if (target === 'file') return printTab(null);
  return printTab(getActiveTab());
}

// Function list
const FUNCTION_RULES = {
  javascript: 'js', jsx: 'js', typescript: 'js', tsx: 'js',
  python: 'python', java: 'java', c: 'cpp', cpp: 'cpp', php: 'php', rust: 'rust', css: 'css', markdown: 'markdown',
};

function firstNamedChildText(node, doc) {
  let child = node.firstChild;
  while (child && !/[A-Za-z]/.test(child.name[0])) child = child.nextSibling;
  return child ? doc.sliceString(child.from, child.to) : null;
}

function childText(node, name, doc) {
  const child = node.getChild(name);
  return child ? doc.sliceString(child.from, child.to) : null;
}

function functionEntry(node, family, doc) {
  const n = node.name;
  switch (family) {
    case 'js':
      if (n === 'FunctionDeclaration') return { kind: 'fn', name: childText(node, 'VariableDefinition', doc) };
      if (n === 'ClassDeclaration') return { kind: 'class', name: childText(node, 'VariableDefinition', doc) };
      if (n === 'MethodDeclaration') return { kind: 'method', name: childText(node, 'PropertyDefinition', doc) };
      if (n === 'InterfaceDeclaration') return { kind: 'interface', name: childText(node, 'TypeDefinition', doc) };
      if (n === 'EnumDeclaration') return { kind: 'enum', name: childText(node, 'TypeDefinition', doc) };
      if (n === 'TypeAliasDeclaration') return { kind: 'type', name: childText(node, 'TypeDefinition', doc) };
      if (n === 'VariableDeclaration' && (node.getChild('ArrowFunction') || node.getChild('FunctionExpression'))) {
        return { kind: 'fn', name: childText(node, 'VariableDefinition', doc) };
      }
      return null;
    case 'python':
      if (n === 'FunctionDefinition') return { kind: 'fn', name: childText(node, 'VariableName', doc) };
      if (n === 'ClassDefinition') return { kind: 'class', name: childText(node, 'VariableName', doc) };
      return null;
    case 'java':
      if (n === 'MethodDeclaration' || n === 'ConstructorDeclaration') return { kind: 'method', name: childText(node, 'Definition', doc) };
      if (n === 'ClassDeclaration') return { kind: 'class', name: childText(node, 'Definition', doc) };
      if (n === 'InterfaceDeclaration') return { kind: 'interface', name: childText(node, 'Definition', doc) };
      if (n === 'EnumDeclaration') return { kind: 'enum', name: childText(node, 'Definition', doc) };
      return null;
    case 'cpp':
      if (n === 'FunctionDefinition') {
        const decl = node.getChild('FunctionDeclarator');
        return { kind: 'fn', name: decl ? firstNamedChildText(decl, doc) : null };
      }
      if (n === 'ClassSpecifier') return { kind: 'class', name: childText(node, 'TypeIdentifier', doc) };
      if (n === 'StructSpecifier') return { kind: 'struct', name: childText(node, 'TypeIdentifier', doc) };
      if (n === 'NamespaceDefinition') return { kind: 'namespace', name: childText(node, 'Identifier', doc) };
      return null;
    case 'php':
      if (n === 'FunctionDefinition') return { kind: 'fn', name: childText(node, 'Name', doc) };
      if (n === 'MethodDeclaration') return { kind: 'method', name: childText(node, 'Name', doc) };
      if (n === 'ClassDeclaration') return { kind: 'class', name: childText(node, 'Name', doc) };
      if (n === 'InterfaceDeclaration') return { kind: 'interface', name: childText(node, 'Name', doc) };
      if (n === 'TraitDeclaration') return { kind: 'trait', name: childText(node, 'Name', doc) };
      return null;
    case 'rust':
      if (n === 'FunctionItem') return { kind: 'fn', name: childText(node, 'BoundIdentifier', doc) };
      if (n === 'StructItem') return { kind: 'struct', name: childText(node, 'TypeIdentifier', doc) };
      if (n === 'EnumItem') return { kind: 'enum', name: childText(node, 'TypeIdentifier', doc) };
      if (n === 'ImplItem') return { kind: 'impl', name: childText(node, 'TypeIdentifier', doc) };
      if (n === 'TraitItem') return { kind: 'trait', name: childText(node, 'TypeIdentifier', doc) };
      return null;
    case 'css':
      if (n === 'RuleSet') {
        const block = node.getChild('Block');
        const end = block ? block.from : node.to;
        return { kind: 'rule', name: doc.sliceString(node.from, end).replace(/\s+/g, ' ').trim() };
      }
      return null;
    case 'markdown': {
      const m = /^(?:ATX|Setext)Heading(\d)$/.exec(n);
      if (m) {
        const text = doc.sliceString(node.from, node.to).replace(/^#+\s*|\s*#+\s*$/g, '').replace(/\n[=-]+\s*$/, '').trim();
        return { kind: 'h' + m[1], name: text };
      }
      return null;
    }
    default:
      return null;
  }
}

let functionListTimer = null;

function functionListVisible() {
  const panel = document.getElementById('function-list');
  return panel && panel.classList.contains('active') && sidebarVisible;
}

function scheduleFunctionListRefresh() {
  if (!functionListVisible()) return;
  if (functionListTimer) clearTimeout(functionListTimer);
  functionListTimer = setTimeout(refreshFunctionList, 400);
}

function refreshFunctionList() {
  const container = document.getElementById('function-list-content');
  if (!container) return;
  const target = statusTarget();
  const view = target.view;
  const family = FUNCTION_RULES[target.language];
  container.innerHTML = '';

  if (!view || !family) {
    container.innerHTML = `<div class="sidebar-placeholder">No function list for ${escapeHtml(languageName(target.language))}</div>`;
    return;
  }

  const state = view.state;
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, doc.length, 300) || syntaxTree(state);
  const entries = [];
  const stack = [];
  tree.iterate({
    enter(n) {
      const entry = functionEntry(n.node, family, doc);
      if (entry && entry.name) {
        entries.push({ ...entry, from: n.from, depth: stack.length });
        stack.push(n.to);
      } else if (entry) {
        return undefined;
      }
      return undefined;
    },
    leave(n) {
      if (stack.length && stack[stack.length - 1] === n.to) {
        const entry = functionEntry(n.node, family, doc);
        if (entry && entry.name) stack.pop();
      }
    },
  });

  if (!entries.length) {
    container.innerHTML = '<div class="sidebar-placeholder">No functions found</div>';
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'fn-item';
    item.style.paddingLeft = (8 + entry.depth * 14) + 'px';
    item.innerHTML = `<span class="fn-kind">${escapeHtml(entry.kind)}</span><span class="fn-name">${escapeHtml(entry.name)}</span>`;
    item.title = `Line ${doc.lineAt(entry.from).number}`;
    item.addEventListener('click', () => {
      view.dispatch({
        selection: { anchor: entry.from },
        effects: EditorView.scrollIntoView(entry.from, { y: 'start', yMargin: 20 }),
      });
      view.focus();
    });
    container.appendChild(item);
  }
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
  const fileName = tabDisplayName(tab);
  const modified = tab && tab.modified ? ' *' : '';
  window.electronAPI.setTitle({ title: `${fileName}${modified} - NotepadPlus` });
}

function statusTarget() {
  const tab = getActiveTab();
  const rightFocused = focusedPane === 'right' && splitEditorView;
  if (rightFocused && splitMode === 'file') {
    return { filePath: splitFilePath, modified: splitModified, eol: splitEol, encoding: splitEncoding, language: splitLanguage, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'tab') {
    const st = tabs.find(t => t.id === splitTabId) || tab;
    return { filePath: st.filePath, modified: st.modified, eol: st.eol, encoding: st.encoding, language: st.language, view: splitEditorView };
  }
  if (rightFocused && splitMode === 'compare') {
    return { filePath: compareRightPath, modified: false, eol: tab.eol, encoding: 'utf8', language: detectLanguageKey(compareRightPath), view: splitEditorView };
  }
  return { filePath: tab.filePath, modified: tab.modified, eol: tab.eol, encoding: tab.encoding, language: tab.language, view: editorView };
}

function updateStatusBar() {
  const tab = getActiveTab();
  if (!tab) return;
  const target = statusTarget();

  document.getElementById('status-file').textContent = target.filePath || tabDisplayName(tab);
  document.getElementById('status-modified').textContent = target.modified ? '(Modified)' : '';

  document.getElementById('status-lang').textContent = languageName(target.language);
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
  if (tab.filePath && /\.(md|markdown|txt)$/i.test(tab.filePath)) linkGraph = null;
  tab.content = content;
  tab.savedContent = content;
  tab.savedEol = tab.eol;
  tab.savedEncoding = tab.encoding;
  tab.modified = false;
  markTabHistorySaved(tab);
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
  const effect = languageCompartment.reconfigure(languageExtensionFor(tab.language));
  if (tab.id === activeTabId) {
    editorView.dispatch({ effects: effect });
  } else {
    tab.state = tab.state.update({ effects: effect }).state;
  }
  if (splitMode === 'tab' && splitTabId === tab.id && splitEditorView) {
    splitEditorView.dispatch({
      effects: splitLanguageCompartment.reconfigure(languageExtensionFor(tab.language)),
    });
  }
  updateStatusBar();
  if (functionListVisible()) refreshFunctionList();
}

function setLanguage(key) {
  if (!LANG_BY_KEY[key]) return;
  const target = rightPaneTarget();
  if (target === 'file') {
    splitLanguage = key;
    splitEditorView.dispatch({ effects: splitLanguageCompartment.reconfigure(languageExtensionFor(key)) });
    updateStatusBar();
    if (functionListVisible()) refreshFunctionList();
    return;
  }
  const tab = target === 'tab' ? tabs.find(t => t.id === splitTabId) : getActiveTab();
  if (!tab) return;
  tab.language = key;
  applyTabLanguage(tab);
}

function showLanguageMenu(anchorEl) {
  const current = statusTarget().language;
  showStatusMenu(anchorEl, languageMenuList().map(l => [l.name, () => setLanguage(l.key), false, l.key === current]));
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
  tab.title = null;
  tab.language = detectLanguageKey(tab.filePath, content);
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
    ...changeHistoryExtensions(changeHistoryCompartment),
    closerPlugin,
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
        scheduleFunctionListRefresh();
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
  document.getElementById('closer-panel').classList.add('hidden');
  document.getElementById('btn-closers').classList.remove('active');
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
    showChangeHistory,
    toolbarHidden: [...toolbarHidden],
    toolbarExtra: [...toolbarExtra],
    toolbarCollapsed,
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
  if (s.showChangeHistory === false && showChangeHistory) toggleChangeHistory();
  if (Array.isArray(s.toolbarHidden)) toolbarHidden = new Set(s.toolbarHidden.filter(id => TOOLBAR_BUILTIN.has(id)));
  if (Array.isArray(s.toolbarExtra)) toolbarExtra = s.toolbarExtra.filter(id => TOOLBAR_ITEMS.some(i => i.id === id && !TOOLBAR_BUILTIN.has(i.id)));
  if (typeof s.toolbarCollapsed === 'boolean') toolbarCollapsed = s.toolbarCollapsed;
  applyToolbarConfig();
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
  linkGraph = null;
  if (linkMapOpen) rescanLinkMap();
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
      if (btn.dataset.panel === 'function-list') {
        refreshFunctionList();
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
    case 'titlecase':
      result = titleCase(selected);
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

// Title Case: capitalize every word except short joining words, which
// stay lowercase unless they open or close a line.
const TITLE_SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'on', 'in', 'at', 'to', 'by']);

function titleCase(text) {
  return text.split('\n').map(line => {
    const words = line.toLowerCase().split(/(\s+)/);
    const wordIdx = words.map((w, i) => (i % 2 === 0 && w ? i : -1)).filter(i => i >= 0);
    const first = wordIdx[0];
    const last = wordIdx[wordIdx.length - 1];
    return words.map((w, i) => {
      if (i % 2 === 1 || !w) return w;
      const bare = w.replace(/[^\p{L}\p{N}']/gu, '');
      if (TITLE_SMALL_WORDS.has(bare) && i !== first && i !== last) return w;
      return w.replace(/\p{L}/u, c => c.toUpperCase());
    }).join('');
  }).join('\n');
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
let splitLanguage = 'plain';
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
      effects: splitLanguageCompartment.reconfigure(languageExtensionFor(tab.language)),
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
  splitEditorView.dispatch({ effects: markSavedEffect.of(null) });
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
  splitLanguage = detectLanguageKey(splitFilePath, content);
  splitEditorView.dispatch({
    effects: [splitLanguageCompartment.reconfigure(languageExtensionFor(splitLanguage)), markSavedEffect.of(null)],
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
    ...changeHistoryExtensions(splitChangeHistoryCompartment),
    closerPlugin,
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
      if (update.docChanged) scheduleFunctionListRefresh();
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
  createSplitEditor(tabContent(tab), languageExtensionFor(tab.language), 'tab');
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
    const langExt = tab ? languageExtensionFor(tab.language) : [];
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
  splitLanguage = detectLanguageKey(filePath, content);
  createSplitEditor(content, languageExtensionFor(splitLanguage), 'file');
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

// Shift+F10 / Menu key: open the edit context menu at the caret.
function openKeyboardContextMenu() {
  if (!window.electronAPI || !window.electronAPI.showContextMenu) return;
  let x, y, word = '';
  const prose = document.getElementById('prose-editor');
  if (proseMode && document.activeElement === prose) {
    const r = prose.getBoundingClientRect();
    x = r.left + 40; y = r.top + 40;
    const text = prose.value;
    const pos = prose.selectionStart;
    const before = /[\p{L}\p{M}'’-]*$/u.exec(text.slice(0, pos));
    const after = /^[\p{L}\p{M}'’-]*/u.exec(text.slice(pos));
    word = (before ? before[0] : '') + (after ? after[0] : '');
  } else {
    const view = activeView();
    if (!view) return;
    const head = view.state.selection.main.head;
    const coords = view.coordsAtPos(head);
    if (coords) { x = coords.left; y = coords.bottom; }
    else { const r = view.dom.getBoundingClientRect(); x = r.left + 40; y = r.top + 40; }
    const w = view.state.wordAt(head);
    if (w) word = view.state.sliceDoc(w.from, w.to);
  }
  window.electronAPI.showContextMenu({ x: Math.round(x), y: Math.round(y), word });
}

function resetSplitDivider() {
  if (!splitView && !compareMode) return;
  document.getElementById('editor').style.width = '';
  document.getElementById('prose-editor').style.width = '';
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

  const langExt = getLanguageExtension(rightPath, rightContent);
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
  'set-language': (key) => setLanguage(key),
  'rename': () => showRenameDialog(null),
  'print': () => printCurrent(),
  'column-editor': () => showColumnEditor(),
  'link-map': () => toggleLinkMap(),
  'toggle-toolbar': () => toggleToolbar(),
  'customize-toolbar': () => showToolbarDialog(),
  'change-history': (action) => changeHistoryCommand(action),
  'check-closers': () => runCloserCheck(),
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
  'split-reset': () => resetSplitDivider(),
  'focus-other-view': () => focusOtherView(),
  'tab': (action) => tabCommand(action),
  'toggle-theme': () => toggleTheme(),
  'language-picker': () => showLanguageMenu(document.getElementById('status-lang')),
  'shortcuts': () => showShortcutsDialog(),
  'command-palette': () => showCommandPalette(),
  'context-menu': () => openKeyboardContextMenu(),
  'toggle-prose': () => toggleProseMode(),
  'grammar-check': () => runGrammarCheck(),
  'compare': () => openCompare(),
};

function runCommand(name, arg) {
  const fn = commands[name];
  if (fn) fn(arg);
}

// Toolbar customization
const TOOLBAR_CATALOG = [
  { group: 'File', items: [
    { id: 'btn-new', label: 'New' },
    { id: 'btn-open', label: 'Open' },
    { id: 'btn-save', label: 'Save' },
    { id: 'btn-save-as', label: 'Save As' },
    { id: 'reload', label: 'Reload', title: 'Reload from Disk', cmd: 'reload' },
    { id: 'save-copy-as', label: 'Save Copy', title: 'Save a Copy As', cmd: 'save-copy-as' },
    { id: 'save-all', label: 'Save All', cmd: 'save-all' },
    { id: 'rename', label: 'Rename', cmd: 'rename' },
    { id: 'close', label: 'Close', title: 'Close tab', cmd: 'close' },
    { id: 'close-all', label: 'Close All', cmd: 'close-all' },
    { id: 'close-others', label: 'Close Others', title: 'Close All But Active', cmd: 'close-others' },
    { id: 'open-folder', label: 'Open Folder', run: () => window.electronAPI && window.electronAPI.openFolder() },
    { id: 'open-containing-folder', label: 'Show in Folder', title: 'Open Containing Folder', cmd: 'open-containing-folder' },
    { id: 'open-default-viewer', label: 'Open With', title: 'Open in Default Viewer', cmd: 'open-default-viewer' },
    { id: 'summary', label: 'Summary', title: 'File Summary', cmd: 'summary' },
    { id: 'print', label: 'Print', cmd: 'print' },
  ] },
  { group: 'Edit', items: [
    { id: 'undo', label: 'Undo', cmd: 'undo' },
    { id: 'redo', label: 'Redo', cmd: 'redo' },
    { id: 'cut', label: 'Cut', run: () => editAction('cut') },
    { id: 'copy', label: 'Copy', run: () => editAction('copy') },
    { id: 'paste', label: 'Paste', run: () => editAction('paste') },
    { id: 'select-all', label: 'Select All', run: () => editAction('selectAll') },
    { id: 'copy-path', label: 'Copy Path', title: 'Copy Full File Path', cmd: 'copy-path' },
    { id: 'copy-filename', label: 'Copy Name', title: 'Copy File Name', cmd: 'copy-filename' },
    { id: 'copy-dir', label: 'Copy Dir', title: 'Copy Directory Path', cmd: 'copy-dir' },
    { id: 'upper', label: 'UPPER', title: 'UPPERCASE', cmd: 'transform', arg: 'uppercase' },
    { id: 'lower', label: 'lower', title: 'lowercase', cmd: 'transform', arg: 'lowercase' },
    { id: 'proper', label: 'Proper', title: 'Proper Case', cmd: 'transform', arg: 'propercase' },
    { id: 'title', label: 'Title', title: 'Title Case', cmd: 'transform', arg: 'titlecase' },
    { id: 'sentence', label: 'Sentence', title: 'Sentence case', cmd: 'transform', arg: 'sentencecase' },
    { id: 'invert', label: 'iNVERT', title: 'iNVERT cASE', cmd: 'transform', arg: 'invertcase' },
    { id: 'random', label: 'ranDOm', title: 'ranDOm CasE', cmd: 'transform', arg: 'randomcase' },
    { id: 'camel', label: 'camelCase', cmd: 'transform', arg: 'camelcase' },
    { id: 'dup-line', label: 'Duplicate', title: 'Duplicate Current Line', cmd: 'line-op', arg: 'duplicate' },
    { id: 'join', label: 'Join', title: 'Join Lines', cmd: 'line-op', arg: 'join' },
    { id: 'move-up', label: 'Line Up', title: 'Move Up Current Line', cmd: 'line-op', arg: 'move-up' },
    { id: 'move-down', label: 'Line Down', title: 'Move Down Current Line', cmd: 'line-op', arg: 'move-down' },
    { id: 'sort-asc', label: 'Sort A-Z', title: 'Sort Lines Ascending', cmd: 'line-op', arg: 'sort-asc' },
    { id: 'sort-desc', label: 'Sort Z-A', title: 'Sort Lines Descending', cmd: 'line-op', arg: 'sort-desc' },
    { id: 'sort-asc-ci', label: 'Sort a-z', title: 'Sort Lines Ascending Ignoring Case', cmd: 'line-op', arg: 'sort-asc-ci' },
    { id: 'sort-desc-ci', label: 'Sort z-a', title: 'Sort Lines Descending Ignoring Case', cmd: 'line-op', arg: 'sort-desc-ci' },
    { id: 'sort-num-asc', label: 'Sort 1-9', title: 'Sort Lines As Numbers Ascending', cmd: 'line-op', arg: 'sort-num-asc' },
    { id: 'sort-num-desc', label: 'Sort 9-1', title: 'Sort Lines As Numbers Descending', cmd: 'line-op', arg: 'sort-num-desc' },
    { id: 'remove-dupes', label: 'Dedupe', title: 'Remove Duplicate Lines', cmd: 'line-op', arg: 'remove-dupes' },
    { id: 'remove-consecutive-dupes', label: 'Dedupe Adjacent', title: 'Remove Consecutive Duplicate Lines', cmd: 'line-op', arg: 'remove-consecutive-dupes' },
    { id: 'remove-empty', label: 'No Empties', title: 'Remove Empty Lines', cmd: 'line-op', arg: 'remove-empty' },
    { id: 'trim', label: 'Trim', title: 'Trim Trailing Whitespace', cmd: 'line-op', arg: 'trim' },
    { id: 'reverse', label: 'Reverse', title: 'Reverse Line Order', cmd: 'line-op', arg: 'reverse' },
    { id: 'randomize', label: 'Shuffle', title: 'Randomize Line Order', cmd: 'line-op', arg: 'randomize' },
    { id: 'toggle-line-comment', label: 'Comment', title: 'Toggle Single Line Comment', cmd: 'toggle-line-comment' },
    { id: 'toggle-block-comment', label: 'Block Comment', title: 'Toggle Block Comment', cmd: 'toggle-block-comment' },
    { id: 'column-editor', label: 'Columns', title: 'Column Editor', cmd: 'column-editor' },
    { id: 'eol-crlf', label: 'CRLF', title: 'Convert line endings to Windows (CR LF)', cmd: 'set-eol', arg: '\r\n' },
    { id: 'eol-lf', label: 'LF', title: 'Convert line endings to Unix (LF)', cmd: 'set-eol', arg: '\n' },
    { id: 'eol-cr', label: 'CR', title: 'Convert line endings to Macintosh (CR)', cmd: 'set-eol', arg: '\r' },
  ] },
  { group: 'Search', items: [
    { id: 'btn-find', label: 'Find' },
    { id: 'btn-replace', label: 'Replace' },
    { id: 'btn-goto', label: 'Go to' },
    { id: 'find-in-files', label: 'Find in Files', cmd: 'find-in-files' },
    { id: 'bm-toggle', label: 'Bookmark', title: 'Toggle Bookmark', cmd: 'bookmark', arg: 'toggle' },
    { id: 'bm-next', label: 'Next Mark', title: 'Next Bookmark', cmd: 'bookmark', arg: 'next' },
    { id: 'bm-prev', label: 'Prev Mark', title: 'Previous Bookmark', cmd: 'bookmark', arg: 'prev' },
    { id: 'bm-clear', label: 'Clear Marks', title: 'Clear All Bookmarks', cmd: 'bookmark', arg: 'clear' },
    { id: 'bm-cut', label: 'Cut Marked', title: 'Cut Bookmarked Lines', cmd: 'bookmark', arg: 'cut' },
    { id: 'bm-copy', label: 'Copy Marked', title: 'Copy Bookmarked Lines', cmd: 'bookmark', arg: 'copy' },
    { id: 'bm-remove', label: 'Remove Marked', title: 'Remove Bookmarked Lines', cmd: 'bookmark', arg: 'remove' },
    { id: 'bm-remove-unmarked', label: 'Keep Marked', title: 'Remove Unmarked Lines', cmd: 'bookmark', arg: 'remove-unmarked' },
    { id: 'bm-inverse', label: 'Invert Marks', title: 'Inverse Bookmark', cmd: 'bookmark', arg: 'inverse' },
    { id: 'ch-next', label: 'Next Change', title: 'Go to Next Change', cmd: 'change-history', arg: 'next' },
    { id: 'ch-prev', label: 'Prev Change', title: 'Go to Previous Change', cmd: 'change-history', arg: 'prev' },
    { id: 'ch-clear', label: 'Clear Changes', title: 'Clear Change History', cmd: 'change-history', arg: 'clear' },
    { id: 'ch-toggle', label: 'Change Bars', title: 'Toggle Change History Margin', cmd: 'change-history', arg: 'toggle' },
    { id: 'btn-closers', label: 'Closers' },
  ] },
  { group: 'Encoding and Language', items: [
    { id: 'enc-utf8', label: 'UTF-8', title: 'Convert to UTF-8', cmd: 'set-encoding', arg: 'utf8' },
    { id: 'enc-utf8bom', label: 'UTF-8-BOM', title: 'Convert to UTF-8-BOM', cmd: 'set-encoding', arg: 'utf8bom' },
    { id: 'enc-utf16le', label: 'UTF-16 LE', title: 'Convert to UTF-16 LE', cmd: 'set-encoding', arg: 'utf16le' },
    { id: 'enc-utf16be', label: 'UTF-16 BE', title: 'Convert to UTF-16 BE', cmd: 'set-encoding', arg: 'utf16be' },
    { id: 'enc-ansi', label: 'ANSI', title: 'Convert to ANSI (Windows-1252)', cmd: 'set-encoding', arg: 'ansi' },
    { id: 'language-menu', label: 'Language', title: 'Choose language', run: (el) => showLanguageMenu(el) },
  ] },
  { group: 'View', items: [
    { id: 'btn-fold-all', label: 'Fold All' },
    { id: 'btn-unfold-all', label: 'Unfold All' },
    { id: 'btn-wrap', label: 'Wrap' },
    { id: 'btn-minimap', label: 'Minimap' },
    { id: 'btn-sidebar-toggle', label: 'Sidebar' },
    { id: 'btn-zoom-in', label: 'A+ (zoom in)' },
    { id: 'btn-zoom-out', label: 'A- (zoom out)' },
    { id: 'zoom-reset', label: 'A=', title: 'Reset Zoom', cmd: 'zoom-reset' },
    { id: 'font-group', label: 'Font picker', widget: true },
    { id: 'bg-group', label: 'Background color', widget: true },
    { id: 'bg-presets', label: 'Background presets', widget: true },
    { id: 'toggle-whitespace', label: 'Spaces', title: 'Toggle Show Space and Tab', cmd: 'toggle-whitespace' },
    { id: 'toggle-eol-markers', label: 'EOL Marks', title: 'Toggle Show End of Line', cmd: 'toggle-eol-markers' },
    { id: 'toggle-split', label: 'Split', title: 'Toggle Split View', cmd: 'toggle-split' },
    { id: 'split-reset', label: 'Even Split', title: 'Reset Split to Equal Halves', cmd: 'split-reset' },
    { id: 'focus-other-view', label: 'Other Pane', title: 'Focus Other View', cmd: 'focus-other-view' },
    { id: 'btn-link-map', label: 'Map' },
    { id: 'tab-next', label: 'Next Tab', cmd: 'tab', arg: 'next' },
    { id: 'tab-prev', label: 'Prev Tab', title: 'Previous Tab', cmd: 'tab', arg: 'prev' },
    { id: 'tab-first', label: 'First Tab', cmd: 'tab', arg: 'first' },
    { id: 'tab-last', label: 'Last Tab', cmd: 'tab', arg: 'last' },
    { id: 'toggle-theme', label: 'Theme', title: 'Toggle Theme (Dark/Light)', cmd: 'toggle-theme' },
    { id: 'autosave-indicator', label: 'Auto-save indicator', widget: true },
  ] },
  { group: 'Tools', items: [
    { id: 'btn-prose', label: 'Prose' },
    { id: 'btn-grammar', label: 'Grammar' },
    { id: 'btn-compare', label: 'Compare' },
    { id: 'command-palette', label: 'Palette', title: 'Command Palette', cmd: 'command-palette' },
    { id: 'shortcuts', label: 'Keys', title: 'Keyboard Shortcuts', cmd: 'shortcuts' },
  ] },
];

const TOOLBAR_ITEMS = TOOLBAR_CATALOG.flatMap(g => g.items);
const TOOLBAR_BUILTIN = new Set(TOOLBAR_ITEMS.filter(i => !i.cmd && !i.run).map(i => i.id));
let toolbarHidden = new Set();
let toolbarExtra = [];
let toolbarCollapsed = false;

function editAction(action) {
  if (window.electronAPI && window.electronAPI.editAction) {
    window.electronAPI.editAction({ action });
  } else {
    document.execCommand(action === 'selectAll' ? 'selectAll' : action);
  }
}

function toolbarItemVisible(item) {
  return TOOLBAR_BUILTIN.has(item.id) ? !toolbarHidden.has(item.id) : toolbarExtra.includes(item.id);
}

function runToolbarItem(item, el) {
  if (item.run) item.run(el);
  else if (item.cmd) runCommand(item.cmd, item.arg);
}

function tidyToolbarSeparators() {
  const toolbar = document.getElementById('toolbar');
  const children = [...toolbar.children];
  const visible = (el) => !el.classList.contains('tb-hidden') && !el.classList.contains('toolbar-separator') && el.id !== 'toolbar-collapse';
  let seenVisible = false;
  let lastSep = null;
  for (const el of children) {
    if (el.classList.contains('toolbar-separator')) {
      el.classList.toggle('tb-hidden', !seenVisible);
      if (seenVisible) { lastSep = el; seenVisible = false; }
    } else if (visible(el)) {
      seenVisible = true;
    }
  }
  if (!seenVisible && lastSep) lastSep.classList.add('tb-hidden');
}

function applyToolbarConfig() {
  const toolbar = document.getElementById('toolbar');
  for (const id of TOOLBAR_BUILTIN) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('tb-hidden', toolbarHidden.has(id));
  }
  toolbar.querySelectorAll('.tb-extra, .tb-extra-sep').forEach(el => el.remove());

  const collapse = document.getElementById('toolbar-collapse');
  const extras = TOOLBAR_ITEMS.filter(i => !TOOLBAR_BUILTIN.has(i.id) && toolbarExtra.includes(i.id));
  if (extras.length) {
    const sep = document.createElement('span');
    sep.className = 'toolbar-separator tb-extra-sep';
    toolbar.insertBefore(sep, collapse);
    for (const item of extras) {
      const btn = document.createElement('button');
      btn.className = 'tb-extra';
      btn.dataset.tbId = item.id;
      btn.textContent = item.label;
      btn.title = item.title || item.label;
      btn.addEventListener('click', () => runToolbarItem(item, btn));
      toolbar.insertBefore(btn, collapse);
    }
  }
  tidyToolbarSeparators();

  toolbar.classList.toggle('collapsed', toolbarCollapsed);
  document.getElementById('toolbar-grip').classList.toggle('hidden', !toolbarCollapsed);
}

function toggleToolbar() {
  toolbarCollapsed = !toolbarCollapsed;
  applyToolbarConfig();
}

function toolbarItemForElement(el) {
  const target = el.closest('[data-tb-id], #toolbar > *');
  if (!target) return null;
  const id = target.dataset.tbId || target.id;
  const wrap = target.closest('#font-group, #bg-group, #bg-presets');
  const wrapId = wrap ? wrap.id : null;
  return TOOLBAR_ITEMS.find(i => i.id === id || i.id === wrapId) || null;
}

function hideToolbarItem(item) {
  if (TOOLBAR_BUILTIN.has(item.id)) toolbarHidden.add(item.id);
  else toolbarExtra = toolbarExtra.filter(id => id !== item.id);
  applyToolbarConfig();
}

function showToolbarContextMenu(e) {
  e.preventDefault();
  const item = toolbarItemForElement(e.target);
  const items = [];
  if (item) items.push([`Hide "${item.label}"`, () => hideToolbarItem(item)]);
  items.push(['Customize Toolbar...', showToolbarDialog]);
  items.push(['Hide Toolbar', toggleToolbar]);
  showPopupMenu(e.clientX, e.clientY, items);
}

function showToolbarDialog() {
  const container = document.getElementById('toolbar-groups');
  container.innerHTML = '';
  for (const group of TOOLBAR_CATALOG) {
    const box = document.createElement('div');
    box.className = 'tb-group';
    const h = document.createElement('h4');
    h.textContent = group.group;
    box.appendChild(h);
    for (const item of group.items) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = toolbarItemVisible(item);
      cb.addEventListener('change', () => {
        if (TOOLBAR_BUILTIN.has(item.id)) {
          if (cb.checked) toolbarHidden.delete(item.id); else toolbarHidden.add(item.id);
        } else if (cb.checked) {
          if (!toolbarExtra.includes(item.id)) toolbarExtra.push(item.id);
        } else {
          toolbarExtra = toolbarExtra.filter(id => id !== item.id);
        }
        applyToolbarConfig();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + (item.title && item.title !== item.label ? `${item.label} (${item.title})` : item.label)));
      box.appendChild(label);
    }
    container.appendChild(box);
  }
  document.getElementById('toolbar-dialog').classList.remove('hidden');
}

function hideToolbarDialog() {
  document.getElementById('toolbar-dialog').classList.add('hidden');
}

function initToolbarCustomization() {
  const toolbar = document.getElementById('toolbar');
  toolbar.addEventListener('contextmenu', showToolbarContextMenu);
  document.getElementById('toolbar-collapse').addEventListener('click', toggleToolbar);
  document.getElementById('toolbar-grip').addEventListener('click', toggleToolbar);
  document.getElementById('toolbar-done').addEventListener('click', hideToolbarDialog);
  document.getElementById('toolbar-reset').addEventListener('click', () => {
    toolbarHidden = new Set();
    toolbarExtra = [];
    applyToolbarConfig();
    showToolbarDialog();
  });
  document.getElementById('toolbar-dialog').addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) hideToolbarDialog();
  });
  document.getElementById('toolbar-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideToolbarDialog();
  });
  applyToolbarConfig();
}

// Link map
let linkMapOpen = false;
let linkGraph = null;
let linkMapCenter = null;
let linkMapHover = null;

function normPath(p) {
  return p ? p.replace(/\\/g, '/') : p;
}

function linkMapVisible() {
  return linkMapOpen;
}

async function openLinkMap() {
  const overlay = document.getElementById('link-map');
  if (!currentFolderPath) {
    overlay.classList.remove('hidden');
    linkMapOpen = true;
    document.getElementById('btn-link-map').classList.add('active');
    document.getElementById('link-map-status').textContent = 'Open a folder first (Open Folder in the sidebar)';
    document.getElementById('link-map-svg').innerHTML = '';
    return;
  }
  overlay.classList.remove('hidden');
  linkMapOpen = true;
  document.getElementById('btn-link-map').classList.add('active');
  if (!linkGraph) await rescanLinkMap();
  else renderLinkMap();
}

function closeLinkMap() {
  linkMapOpen = false;
  document.getElementById('link-map').classList.add('hidden');
  document.getElementById('btn-link-map').classList.remove('active');
  activeView().focus();
}

function toggleLinkMap() {
  if (linkMapOpen) closeLinkMap();
  else openLinkMap();
}

async function rescanLinkMap() {
  if (!window.electronAPI || !window.electronAPI.scanLinks || !currentFolderPath) return;
  document.getElementById('link-map-status').textContent = 'Scanning...';
  const result = await window.electronAPI.scanLinks({ dirPath: currentFolderPath });
  if (!result.success) {
    document.getElementById('link-map-status').textContent = 'Scan failed: ' + (result.error || 'unknown');
    return;
  }
  linkGraph = buildLinkGraph(result);
  renderLinkMap();
}

function buildLinkGraph(result) {
  const nodes = new Map();
  for (const f of result.files) {
    const p = normPath(f);
    nodes.set(p, { path: p, name: getFileName(p), out: new Set(), in: new Set(), missing: [] });
  }
  const edges = new Map();
  for (const l of result.links) {
    const from = normPath(l.from);
    const src = nodes.get(from);
    if (!src) continue;
    if (!l.to) {
      src.missing.push(l.text);
      continue;
    }
    const to = normPath(l.to);
    if (to === from || !nodes.has(to)) continue;
    src.out.add(to);
    nodes.get(to).in.add(from);
    const key = from < to ? from + '\u0000' + to : to + '\u0000' + from;
    let e = edges.get(key);
    if (!e) {
      e = { a: from < to ? from : to, b: from < to ? to : from, ab: false, ba: false };
      edges.set(key, e);
    }
    if (from === e.a) e.ab = true; else e.ba = true;
  }
  return { nodes, edges: [...edges.values()] };
}

function linkMapCenterPath() {
  const target = statusTarget();
  const p = normPath(target.filePath);
  if (linkGraph && p && linkGraph.nodes.has(p)) return p;
  return null;
}

function layoutLinkMap(center, showOrphans) {
  const { nodes } = linkGraph;
  const placed = new Map();
  const neighbors = (p) => {
    const n = nodes.get(p);
    return [...new Set([...n.out, ...n.in])];
  };

  if (center) {
    const tree = new Map();
    const ring = new Map([[center, 0]]);
    const queue = [center];
    tree.set(center, []);
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of neighbors(cur).sort()) {
        if (ring.has(nb)) continue;
        ring.set(nb, ring.get(cur) + 1);
        tree.get(cur).push(nb);
        tree.set(nb, []);
        queue.push(nb);
      }
    }
    const leaves = new Map();
    const countLeaves = (p) => {
      const kids = tree.get(p);
      const c = kids.length ? kids.reduce((s, k) => s + countLeaves(k), 0) : 1;
      leaves.set(p, c);
      return c;
    };
    countLeaves(center);
    const assign = (p, a0, a1) => {
      const kids = tree.get(p);
      if (!kids.length) return;
      const total = leaves.get(p);
      let a = a0;
      for (const k of kids) {
        const span = (a1 - a0) * (leaves.get(k) / total);
        placed.set(k, { ring: ring.get(k), angle: a + span / 2 });
        assign(k, a, a + span);
        a += span;
      }
    };
    placed.set(center, { ring: 0, angle: 0 });
    assign(center, -Math.PI / 2, Math.PI * 1.5);
  }

  const maxRing = Math.max(0, ...[...placed.values()].map(v => v.ring));
  if (showOrphans || !center) {
    const rest = [...nodes.keys()].filter(p => !placed.has(p)).sort();
    const outer = maxRing + 1;
    rest.forEach((p, i) => {
      placed.set(p, { ring: outer, angle: -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(1, rest.length), orphan: true });
    });
  }
  return placed;
}

function renderLinkMap() {
  const svg = document.getElementById('link-map-svg');
  const status = document.getElementById('link-map-status');
  if (!linkGraph) return;

  const follow = document.getElementById('link-map-follow').checked;
  const showOrphans = document.getElementById('link-map-orphans').checked;
  if (follow || !linkMapCenter || !linkGraph.nodes.has(linkMapCenter)) {
    linkMapCenter = linkMapCenterPath() || linkMapCenter;
  }
  if (linkMapCenter && !linkGraph.nodes.has(linkMapCenter)) linkMapCenter = null;

  const placed = layoutLinkMap(linkMapCenter, showOrphans);
  const rect = svg.getBoundingClientRect();
  const W = Math.max(200, rect.width);
  const H = Math.max(200, rect.height);
  const cx = W / 2;
  const cy = H / 2;
  const maxRing = Math.max(1, ...[...placed.values()].map(v => v.ring));
  const R = Math.min(W, H) / 2 - 70;
  const radiusFor = (ring) => (ring === 0 ? 0 : (R * ring) / maxRing);
  const pos = new Map();
  for (const [p, v] of placed) {
    const r = radiusFor(v.ring);
    pos.set(p, { x: cx + r * Math.cos(v.angle), y: cy + r * Math.sin(v.angle), ...v });
  }

  const nodeCount = placed.size;
  const linkCount = linkGraph.edges.filter(e => pos.has(e.a) && pos.has(e.b)).length;
  const missingCount = [...linkGraph.nodes.values()].reduce((s, n) => s + n.missing.length, 0);
  status.textContent = linkMapCenter
    ? `${nodeCount} file${nodeCount === 1 ? '' : 's'} within reach, ${linkCount} link${linkCount === 1 ? '' : 's'}${missingCount ? `, ${missingCount} missing target${missingCount === 1 ? '' : 's'}` : ''}`
    : `Active file is not a .md/.txt in the folder; showing all ${nodeCount} files`;

  const esc = escapeHtml;
  const parts = [];
  parts.push(`<defs>
    <marker id="lm-arrow-one" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="lm-arrow-one"/></marker>
    <marker id="lm-arrow-two" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="lm-arrow-two"/></marker>
  </defs>`);

  for (let k = 1; k <= maxRing; k++) {
    parts.push(`<circle class="lm-ring" cx="${cx}" cy="${cy}" r="${radiusFor(k)}"/>`);
  }

  const NODE_R = 7;
  const shorten = (x1, y1, x2, y2, pad) => {
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy) || 1;
    return [x1 + (dx / d) * pad, y1 + (dy / d) * pad, x2 - (dx / d) * pad, y2 - (dy / d) * pad];
  };

  for (const e of linkGraph.edges) {
    const A = pos.get(e.a), B = pos.get(e.b);
    if (!A || !B) continue;
    const two = e.ab && e.ba;
    let from = A, to = B;
    if (!two && e.ba) { from = B; to = A; }
    const [x1, y1, x2, y2] = shorten(from.x, from.y, to.x, to.y, NODE_R + 3);
    const hot = linkMapHover && (e.a === linkMapHover || e.b === linkMapHover);
    parts.push(`<line class="lm-edge ${two ? 'lm-two' : 'lm-one'}${hot ? ' lm-hot' : ''}" data-a="${esc(e.a)}" data-b="${esc(e.b)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#lm-arrow-${two ? 'two' : 'one'})"${two ? ` marker-start="url(#lm-arrow-two)"` : ''}/>`);
  }

  for (const [p, v] of pos) {
    const n = linkGraph.nodes.get(p);
    if (!n.missing.length) continue;
    n.missing.forEach((text, i) => {
      const ang = v.angle + (i + 1) * 0.35 + (v.ring === 0 ? 0 : Math.PI);
      const len = 42;
      const x2 = v.x + len * Math.cos(ang), y2 = v.y + len * Math.sin(ang);
      parts.push(`<line class="lm-edge lm-broken" x1="${v.x}" y1="${v.y}" x2="${x2}" y2="${y2}"/>`);
      parts.push(`<text class="lm-missing" x="${x2 + 4 * Math.cos(ang)}" y="${y2 + 4 * Math.sin(ang)}" text-anchor="${Math.cos(ang) < 0 ? 'end' : 'start'}">${esc(text)}?</text>`);
    });
  }

  for (const [p, v] of pos) {
    const n = linkGraph.nodes.get(p);
    const isCenter = p === linkMapCenter;
    const hot = linkMapHover === p || (linkMapHover && (n.out.has(linkMapHover) || n.in.has(linkMapHover)));
    const cls = ['lm-node', isCenter ? 'lm-center' : '', v.orphan ? 'lm-orphan' : '', hot ? 'lm-hot' : ''].filter(Boolean).join(' ');
    const label = n.name.replace(/\.(md|markdown|txt)$/i, '');
    const labelSide = v.ring === 0 ? 'middle' : (Math.cos(v.angle) < -0.2 ? 'end' : Math.cos(v.angle) > 0.2 ? 'start' : 'middle');
    const lx = v.ring === 0 ? v.x : v.x + 12 * Math.cos(v.angle);
    const ly = v.ring === 0 ? v.y + 22 : v.y + 12 * Math.sin(v.angle) + 4;
    parts.push(`<g class="${cls}" data-path="${esc(p)}"><circle cx="${v.x}" cy="${v.y}" r="${isCenter ? NODE_R + 4 : NODE_R}"/><text x="${lx}" y="${ly}" text-anchor="${labelSide}">${esc(label)}</text><title>${esc(p)}\n${n.out.size} out, ${n.in.size} in${n.missing.length ? `, ${n.missing.length} missing` : ''}</title></g>`);
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = parts.join('');

  svg.querySelectorAll('.lm-node').forEach(g => {
    const p = g.dataset.path;
    g.addEventListener('mouseenter', () => { linkMapHover = p; renderLinkMap(); });
    g.addEventListener('mouseleave', () => { linkMapHover = null; renderLinkMap(); });
    g.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        linkMapCenter = p;
        document.getElementById('link-map-follow').checked = false;
        renderLinkMap();
      } else {
        closeLinkMap();
        openFileFromPath(p);
      }
    });
  });
}

function initLinkMap() {
  document.getElementById('btn-link-map').addEventListener('click', toggleLinkMap);
  document.getElementById('link-map-close').addEventListener('click', closeLinkMap);
  document.getElementById('link-map-refresh').addEventListener('click', rescanLinkMap);
  document.getElementById('link-map-orphans').addEventListener('change', renderLinkMap);
  document.getElementById('link-map-follow').addEventListener('change', renderLinkMap);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && linkMapOpen) closeLinkMap();
  });
  window.addEventListener('resize', () => { if (linkMapOpen) renderLinkMap(); });
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
  document.getElementById('status-lang').addEventListener('click', (e) => showLanguageMenu(e.currentTarget));
  if (window.electronAPI && window.electronAPI.setLanguageList) {
    window.electronAPI.setLanguageList(languageMenuList());
  }
}

function initTabShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      openKeyboardContextMenu();
      return;
    }
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
  document.getElementById('btn-closers').addEventListener('click', runCloserCheck);
  document.getElementById('closer-close').addEventListener('click', closeCloserPanel);
  document.getElementById('closer-rerun').addEventListener('click', runCloserCheck);
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
    scheduleFunctionListRefresh();
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
    if (window.electronAPI.onMenuTemplate) {
      window.electronAPI.onMenuTemplate((items) => setMenuItems(items));
    }

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

// Command palette and shortcut reference. The main process sends the
// flattened menu (label, path, command, arg, accelerator) whenever it
// rebuilds; editor-level bindings and pane commands are added here.
let menuItems = [];

const EDITOR_BINDINGS = [
  ['Select next occurrence of selection', 'Ctrl+D'],
  ['Select all occurrences of selection', 'Ctrl+Shift+L'],
  ['Select line', 'Alt+L'],
  ['Select enclosing syntax', 'Ctrl+I'],
  ['Add cursor above / below', 'Ctrl+Alt+Up / Down'],
  ['Copy line up / down', 'Shift+Alt+Up / Down'],
  ['Indent less / more', 'Ctrl+[ / Ctrl+]'],
  ['Fold / unfold at cursor', 'Ctrl+Alt+[ / Ctrl+Alt+]'],
  ['Jump to matching bracket', 'Ctrl+Shift+\\'],
  ['Find next / previous', 'F3 / Shift+F3'],
  ['Autocomplete', 'Ctrl+Space'],
  ['Insert blank line below', 'Ctrl+Enter'],
  ['Column (rectangular) selection', 'Alt + drag'],
  ['Multiple cursors', 'Ctrl + click'],
  ['Open context menu at caret', 'Shift+F10 or Menu key'],
];

function setMenuItems(items) {
  menuItems = Array.isArray(items) ? items.filter(i => i && i.label) : [];
}

function formatAccelerator(acc) {
  if (!acc) return '';
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  return acc
    .replace(/CmdOrCtrl|CommandOrControl/g, isMac ? 'Cmd' : 'Ctrl')
    .replace(/\bPlus\b/g, '+')
    .replace(/\bLeft\b/, 'Left').replace(/\bRight\b/, 'Right');
}

function paletteEntries() {
  return menuItems.map(item => ({
    label: item.label,
    path: item.path.join(' > '),
    key: formatAccelerator(item.accelerator),
    run: () => {
      if (item.name) runCommand(item.name, item.arg);
      else if (window.electronAPI && window.electronAPI.runNativeMenuItem) window.electronAPI.runNativeMenuItem(item.native);
    },
  }));
}

function scoreEntry(entry, query) {
  const hay = (entry.path + ' ' + entry.label).toLowerCase();
  const label = entry.label.toLowerCase();
  if (!query) return 1;
  if (label.startsWith(query)) return 4;
  if (label.includes(query)) return 3;
  if (hay.includes(query)) return 2;
  // Every word of the query appears somewhere, in any order.
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every(w => hay.includes(w))) return 1;
  return 0;
}

let paletteActive = 0;
let paletteShown = [];

function renderPalette() {
  const list = document.getElementById('palette-list');
  const q = document.getElementById('palette-input').value.trim().toLowerCase();
  paletteShown = paletteEntries()
    .map(e => ({ e, s: scoreEntry(e, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.e);
  list.textContent = '';
  if (!paletteShown.length) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    empty.textContent = menuItems.length ? 'No matching command.' : 'Command list not loaded yet.';
    list.appendChild(empty);
    return;
  }
  paletteActive = Math.min(paletteActive, paletteShown.length - 1);
  paletteShown.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'palette-item' + (i === paletteActive ? ' active' : '');
    const path = document.createElement('span');
    path.className = 'p-path';
    path.textContent = entry.path;
    const label = document.createElement('span');
    label.className = 'p-label';
    label.textContent = entry.label;
    const key = document.createElement('span');
    key.className = 'p-key';
    key.textContent = entry.key;
    el.append(path, label, key);
    el.addEventListener('mousemove', () => { if (paletteActive !== i) { paletteActive = i; renderPalette(); } });
    el.addEventListener('click', () => runPaletteEntry(i));
    list.appendChild(el);
  });
  const activeEl = list.children[paletteActive];
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function runPaletteEntry(i) {
  const entry = paletteShown[i];
  hideCommandPalette();
  if (entry) entry.run();
}

function showCommandPalette() {
  const dialog = document.getElementById('palette-dialog');
  const input = document.getElementById('palette-input');
  dialog.classList.remove('hidden');
  input.value = '';
  paletteActive = 0;
  renderPalette();
  input.focus();
}

function hideCommandPalette() {
  document.getElementById('palette-dialog').classList.add('hidden');
  const v = activeView();
  if (v) v.focus();
}

function initCommandPalette() {
  const dialog = document.getElementById('palette-dialog');
  const input = document.getElementById('palette-input');
  input.addEventListener('input', () => { paletteActive = 0; renderPalette(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteActive = Math.min(paletteActive + 1, paletteShown.length - 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteActive = Math.max(paletteActive - 1, 0); renderPalette(); }
    else if (e.key === 'PageDown') { e.preventDefault(); paletteActive = Math.min(paletteActive + 10, paletteShown.length - 1); renderPalette(); }
    else if (e.key === 'PageUp') { e.preventDefault(); paletteActive = Math.max(paletteActive - 10, 0); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPaletteEntry(paletteActive); }
    else if (e.key === 'Escape') { e.preventDefault(); hideCommandPalette(); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) hideCommandPalette(); });
}

function shortcutRows() {
  const rows = [];
  for (const item of menuItems) {
    if (!item.accelerator) continue;
    rows.push({ group: item.path[0] || 'Menu', label: [...item.path.slice(1), item.label].join(' > '), key: formatAccelerator(item.accelerator) });
  }
  for (const [label, key] of EDITOR_BINDINGS) rows.push({ group: 'Editor', label, key });
  return rows;
}

function renderShortcuts() {
  const list = document.getElementById('shortcuts-list');
  const q = document.getElementById('shortcuts-filter').value.trim().toLowerCase();
  list.textContent = '';
  const rows = shortcutRows().filter(r => !q || (r.group + ' ' + r.label + ' ' + r.key).toLowerCase().includes(q));
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r); }
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    empty.textContent = 'No matching shortcut.';
    list.appendChild(empty);
    return;
  }
  for (const [group, items] of groups) {
    const g = document.createElement('div');
    g.className = 'sc-group';
    const h = document.createElement('h4');
    h.textContent = group;
    g.appendChild(h);
    for (const r of items) {
      const row = document.createElement('div');
      row.className = 'sc-row';
      const l = document.createElement('span');
      l.textContent = r.label;
      const k = document.createElement('span');
      k.className = 'sc-key';
      k.textContent = r.key;
      row.append(l, k);
      g.appendChild(row);
    }
    list.appendChild(g);
  }
}

function showShortcutsDialog() {
  const dialog = document.getElementById('shortcuts-dialog');
  const input = document.getElementById('shortcuts-filter');
  dialog.classList.remove('hidden');
  input.value = '';
  renderShortcuts();
  input.focus();
}

function hideShortcutsDialog() {
  document.getElementById('shortcuts-dialog').classList.add('hidden');
  const v = activeView();
  if (v) v.focus();
}

function initShortcutsDialog() {
  const dialog = document.getElementById('shortcuts-dialog');
  document.getElementById('shortcuts-filter').addEventListener('input', renderShortcuts);
  document.getElementById('shortcuts-close').addEventListener('click', hideShortcutsDialog);
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); hideShortcutsDialog(); } });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) hideShortcutsDialog(); });
}

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  wireEvents();
  initCommandPalette();
  initShortcutsDialog();
  setEditorFont(document.getElementById('font-select').value);
  initSidebarTabs();
  initSidebarResize();
  initSplitGutter();
  initDragAndDrop();
  initGotoLineDialog();
  initProseFind();
  initTabShortcuts();
  initFindInFiles();
  initRenameDialog();
  initColumnEditor();
  initLinkMap();
  initToolbarCustomization();
  initMinimap();
  loadRecentFiles();
});
