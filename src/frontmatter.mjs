// Frontmatter: a YAML-style metadata block at the very top of a file.
//
//   ---
//   title: My note
//   tags: [draft, ideas]
//   ---
//   Body text starts here.
//
// Everything here is built around one rule: editing metadata may only ever
// change the block. The body (all text after the closing line) must come
// out byte for byte the same. Every edit goes through apply(), which checks
// that and throws if it would not hold.
//
// Untouched lines are kept exactly as written, so comments, nested YAML,
// and anything this parser does not understand survive an edit.
//
// Pure functions only. No editor imports, so the app and the command-line
// tool share this file and it is easy to test.

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const KEY_LINE_RE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)[ \t]*:(.*)$/;
const OPEN_RE = /^---[ \t]*(\r\n|\n|$)/;
const CLOSE_RE = /^(---|\.\.\.)[ \t]*$/;
const EOL_RE = /\r\n|\n/;

// Parse the block at the top of `text`. Returns the pieces needed to put
// the text back together: prefix (a BOM, if any) + block + body.
export function parse(text) {
  const bom = text.charCodeAt(0) === 0xFEFF ? '﻿' : '';
  const rest = text.slice(bom.length);
  const open = OPEN_RE.exec(rest);
  const none = {
    present: false, bom, eol: detectEol(text), entries: [],
    block: '', body: rest,
  };
  if (!open || open[1] === '') return none;

  const eol = open[1];
  let pos = open[0].length;
  const lines = [];
  let blockEnd = -1;
  while (pos <= rest.length) {
    const m = /\r\n|\n/.exec(rest.slice(pos));
    const lineEnd = m ? pos + m.index : rest.length;
    const line = rest.slice(pos, lineEnd);
    const next = m ? lineEnd + m[0].length : rest.length;
    if (CLOSE_RE.test(line)) { blockEnd = next; break; }
    if (!m) return none; // ran off the end with no closing line
    lines.push(line);
    pos = next;
  }
  if (blockEnd === -1) return none;

  return {
    present: true,
    bom,
    eol,
    entries: toEntries(lines),
    block: rest.slice(0, blockEnd),
    body: rest.slice(blockEnd),
  };
}

function detectEol(text) {
  const m = /\r\n|\n/.exec(text);
  return m ? m[0] : '\n';
}

// A key line starts an entry; indented lines and "- item" lines belong to
// it. Anything else (comments, blank lines) is kept as its own raw line.
function toEntries(lines) {
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const m = KEY_LINE_RE.exec(line);
    if (m) {
      cur = { key: m[1], first: m[2].replace(/^ /, ''), cont: [], lines: [line] };
      entries.push(cur);
    } else if (cur && /^(\s|-)/.test(line) && line.trim() !== '') {
      cur.cont.push(line);
      cur.lines.push(line);
    } else {
      cur = null;
      entries.push({ key: null, lines: [line] });
    }
  }
  for (const e of entries) {
    if (e.key !== null) {
      e.value = e.cont.length ? e.first + '\n' + e.cont.join('\n') : e.first;
      e.origKey = e.key;
      e.origValue = e.value;
      delete e.first;
      delete e.cont;
    }
  }
  return entries;
}

export function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

// Returns an error message, or null when the value is safe to write.
export function checkValue(value) {
  if (typeof value !== 'string') return 'Value must be text.';
  const parts = value.split(EOL_RE);
  for (let i = 0; i < parts.length; i++) {
    if (CLOSE_RE.test(parts[i])) return 'A line of --- or ... would end the metadata block.';
    if (i > 0 && parts[i] !== '' && !/^(\s|-)/.test(parts[i])) {
      return 'Lines after the first must be indented or start with "- ".';
    }
  }
  return null;
}

export function getField(parsed, key) {
  const e = parsed.entries.find(x => x.key === key);
  return e ? e.value : undefined;
}

export function fields(parsed) {
  return parsed.entries.filter(e => e.key !== null).map(e => ({ key: e.key, value: e.value }));
}

// Mutators return a new parsed object and never touch the one passed in.
function clone(parsed) {
  return { ...parsed, entries: parsed.entries.map(e => ({ ...e, lines: [...e.lines] })) };
}

export function setField(parsed, key, value) {
  if (!isValidKey(key)) throw new Error(`"${key}" is not a valid key. Use letters, digits, _, -, and .`);
  const bad = checkValue(value);
  if (bad) throw new Error(bad);
  const out = clone(parsed);
  const e = out.entries.find(x => x.key === key);
  if (e) {
    e.value = value;
  } else {
    out.entries.push({ key, value, origKey: null, origValue: null, lines: [] });
  }
  return out;
}

export function removeField(parsed, key) {
  const out = clone(parsed);
  out.entries = out.entries.filter(e => e.key !== key);
  return out;
}

export function renameField(parsed, oldKey, newKey) {
  if (!isValidKey(newKey)) throw new Error(`"${newKey}" is not a valid key.`);
  if (oldKey !== newKey && parsed.entries.some(e => e.key === newKey)) {
    throw new Error(`"${newKey}" already exists.`);
  }
  const out = clone(parsed);
  const e = out.entries.find(x => x.key === oldKey);
  if (e) e.key = newKey;
  return out;
}

function entryLines(e) {
  if (e.key === null) return e.lines;
  if (e.key === e.origKey && e.value === e.origValue) return e.lines;
  const parts = e.value.split(EOL_RE);
  const head = parts[0] === '' ? `${e.key}:` : `${e.key}: ${parts[0]}`;
  return [head, ...parts.slice(1)];
}

// The block as text: the --- lines and the fields between them.
export function serializeBlock(parsed) {
  const eol = parsed.eol || '\n';
  const lines = [];
  for (const e of parsed.entries) lines.push(...entryLines(e));
  return '---' + eol + lines.map(l => l + eol).join('') + '---' + eol;
}

function bodyOf(text) {
  return parse(text).body;
}

// Build the full new text from `parsed`, keeping the old body. Throws if
// the body would differ. This is the guard: callers write only what this
// returns.
export function apply(oldText, parsed) {
  const old = parse(oldText);
  const block = serializeBlock(parsed);
  const next = old.bom + block + old.body;
  const check = parse(next);
  if (check.body !== old.body) {
    throw new Error('Refused: this edit would change the body of the file.');
  }
  return { text: next, block, from: old.bom.length, to: old.bom.length + old.block.length, oldBlock: old.block };
}

// Start a block on a file that has none.
export function emptyFor(text) {
  const p = parse(text);
  return { ...p, present: true, entries: [], block: '' };
}

// Accept a pasted block (for example one an AI returned) and swap it in.
// Only a lone --- block is accepted: anything after the closing line, other
// than whitespace, is refused so pasted text can never alter the body.
export function parseBlockText(blockText) {
  let t = String(blockText).replace(/^﻿/, '').replace(/^\s*\n/, '');
  const fence = /^```[A-Za-z]*[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*$/.exec(t.trim());
  if (fence) t = fence[1].trim() + '\n';
  const p = parse(t.replace(/^\s+/, ''));
  if (!p.present) throw new Error('That is not a metadata block. It must start with --- and end with a --- line.');
  if (p.body.trim() !== '') {
    throw new Error('Refused: there is text after the closing --- line. Paste only the metadata block.');
  }
  for (const e of p.entries) {
    if (e.key !== null) {
      const bad = checkValue(e.value);
      if (bad) throw new Error(`"${e.key}": ${bad}`);
    }
  }
  const seen = new Set();
  for (const e of p.entries) {
    if (e.key === null) continue;
    if (seen.has(e.key)) throw new Error(`"${e.key}" appears twice.`);
    seen.add(e.key);
  }
  return p;
}

// Replace the file's block with a pasted one, using the file's own line
// endings for the block. The pasted lines are kept as written.
export function replaceBlock(oldText, blockText) {
  const old = parse(oldText);
  const pasted = parseBlockText(blockText);
  const eol = old.present ? old.eol : detectEol(oldText);
  return apply(oldText, { ...pasted, eol });
}

export { bodyOf };
