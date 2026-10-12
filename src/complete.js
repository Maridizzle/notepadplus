// Word completion. Three sources merged into one ranked list:
//   1. Learned words: everything you have finished typing, ranked by count.
//      Persisted by the renderer through the Electron side.
//   2. Words already in the current document.
//   3. A frequency-ranked dictionary (words.js).
//
// Pure functions only. No editor imports, so this file is easy to test.

import WORDS from './words.js';

const MIN_PREFIX = 3;
const MAX_RESULTS = 8;
const DOC_CACHE_MS = 1500;
const DOC_WORD_RE = /\p{L}[\p{L}']*/gu;
const LEARNABLE_RE = /^\p{L}+(?:'\p{L}+)?$/u;

const learned = new Map();
let learnedDirty = false;

function loadLearned(obj) {
  learned.clear();
  for (const [word, count] of Object.entries(obj || {})) {
    if (typeof count === 'number' && count > 0) learned.set(word, count);
  }
  learnedDirty = false;
}

function exportLearned() {
  return Object.fromEntries(learned);
}

function takeLearnedDirty() {
  const was = learnedDirty;
  learnedDirty = false;
  return was;
}

function learnWord(word) {
  if (!word || word.length < MIN_PREFIX || !LEARNABLE_RE.test(word)) return;
  const lower = word.toLowerCase();
  learned.set(lower, (learned.get(lower) || 0) + 1);
  learnedDirty = true;
}

// Words in the document, lowercased, refreshed at most every DOC_CACHE_MS
// so large files are not rescanned on every keystroke.
let docCache = { key: null, time: 0, words: [] };

function docWords(getText, key) {
  const now = Date.now();
  if (docCache.key === key && now - docCache.time < DOC_CACHE_MS) return docCache.words;
  const set = new Set();
  const text = getText();
  let m;
  DOC_WORD_RE.lastIndex = 0;
  while ((m = DOC_WORD_RE.exec(text)) !== null) {
    if (m[0].length >= MIN_PREFIX) set.add(m[0].toLowerCase());
  }
  docCache = { key, time: now, words: [...set] };
  return docCache.words;
}

function matchCase(prefix, word) {
  if (prefix.length > 1 && prefix === prefix.toUpperCase() && /\p{Lu}/u.test(prefix)) {
    return word.toUpperCase();
  }
  if (/^\p{Lu}/u.test(prefix)) return word[0].toUpperCase() + word.slice(1);
  return word;
}

// Returns up to `limit` completions for `prefix`, best first, in the case
// the prefix was typed in. `getText` returns the full document text and is
// only called when the document-word cache is stale. `key` identifies the
// document for that cache.
function suggest(prefix, getText, key, limit = MAX_RESULTS) {
  if (!prefix || prefix.length < MIN_PREFIX) return [];
  const lower = prefix.toLowerCase();
  const seen = new Set([lower]);
  const results = [];
  const push = (word) => {
    if (results.length >= limit || seen.has(word) || word.length <= lower.length) return;
    seen.add(word);
    results.push(word);
  };

  const fromLearned = [];
  for (const [word, count] of learned) {
    if (word.startsWith(lower)) fromLearned.push([word, count]);
  }
  fromLearned.sort((a, b) => b[1] - a[1]);
  for (const [word] of fromLearned) push(word);

  if (results.length < limit) {
    for (const word of docWords(getText, key)) {
      if (word.startsWith(lower)) push(word);
      if (results.length >= limit) break;
    }
  }

  if (results.length < limit) {
    for (const word of WORDS) {
      if (word.startsWith(lower)) push(word);
      if (results.length >= limit) break;
    }
  }

  return results.map(word => matchCase(prefix, word));
}

export { MIN_PREFIX, suggest, learnWord, loadLearned, exportLearned, takeLearnedDirty };
